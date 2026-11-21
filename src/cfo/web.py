"""Same-origin React dashboard and PostgreSQL-backed CFO API."""

import json
from calendar import monthrange
from collections.abc import Iterator
from contextlib import contextmanager
from datetime import date
from decimal import Decimal
from pathlib import Path
from typing import Annotated, Literal
from urllib.parse import quote
from uuid import UUID

import httpx
import psycopg
from fastapi import FastAPI, HTTPException, Query, Request, Response
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, ConfigDict, Field

from cfo import accounts
from cfo import data_files as files
from cfo import workspace as ws
from cfo.analysis import keyed_flows
from cfo.config import Settings
from cfo.db import import_statement
from cfo.forecast_tools import credit_path
from cfo.ingestion import parse_cash_flow_plan
from cfo.ledger import parse_invoices, save_category, save_invoice_decision
from cfo.llm import ModelError
from cfo.models import Money, PlannedCashFlow
from cfo.scenarios import SettlementTerms, compare_scenarios
from cfo.service import assess, database_dsn
from cfo.workflow import Decision, decide, find_by_request_id

app = FastAPI(title="Autonomous CFO")
app.include_router(accounts.router)
MAX_BODY = 4 * 1024 * 1024


@app.middleware("http")
async def api_access(request: Request, call_next):
    if request.url.path.startswith("/api/"):
        if request.method == "POST":
            if request.headers.get("X-CFO-Client") != "dashboard":
                return JSONResponse({"detail": "Missing dashboard request header"}, status_code=403)
            size = request.headers.get("content-length", "")
            if not size.isdecimal() or int(size) > MAX_BODY:
                return JSONResponse({"detail": "Request exceeds 4 MiB"}, status_code=413)
        response = await call_next(request)
        response.headers["Cache-Control"] = "no-store"
        return response
    return await call_next(request)


@app.exception_handler(RequestValidationError)
async def invalid_request(request, exc):
    # Field validation responses must not echo credentials or verification codes.
    return JSONResponse(
        {"detail": [{"loc": error["loc"], "msg": error["msg"]} for error in exc.errors()]},
        status_code=422,
    )


@app.exception_handler(ValueError)
async def invalid_input(request, exc):
    if isinstance(exc, ModelError):
        return JSONResponse({"detail": str(exc), "code": exc.code}, status_code=503)
    return JSONResponse({"detail": str(exc)}, status_code=422)


@app.exception_handler(psycopg.OperationalError)
async def database_unavailable(request, exc):
    return JSONResponse({"detail": "PostgreSQL is unavailable"}, status_code=503)


class Change(BaseModel):
    model_config = ConfigDict(extra="forbid")
    revision: UUID


class ForecastChange(Change):
    settings: ws.ForecastSettings
    statement: str | None = None
    plan: str | None = None
    invoices: str | None = None  # Empty text removes the optional invoice file.


class Category(Change):
    source_row: int
    category: str = Field(min_length=1, max_length=100)
    future: bool = False


class Match(Change):
    invoice_id: str
    source_row: int | None


class Terms(Change):
    terms: SettlementTerms


@contextmanager
def current(request, revision, *, lock=True) -> Iterator:
    dsn = database_dsn(Settings())
    with ws.connection(dsn) as conn:
        row = ws.lookup(conn, accounts.current_user(conn, request)["workspace_id"], lock=lock)
        if not row or row["revision"] != revision:
            raise HTTPException(409, "Forecast changed. Refresh the workspace and try again.")
        yield conn, dsn, row


@app.get("/api/live")
def live():
    return {"app": "ready"}


@app.get("/api/ready")
def ready():
    with ws.connection(database_dsn(Settings())) as conn:
        conn.execute("SELECT workspace_id FROM cfo_users LIMIT 0")
    return {"db": "ready"}


@app.get("/api/health")
def health():
    settings = Settings()
    try:
        ready()
        db = "ready"
    except (psycopg.Error, ValueError):
        db = "unavailable"
    try:
        token = settings.llm_api_key.get_secret_value()
        result = httpx.get(
            settings.llm_base_url.rstrip("/") + "/models",
            timeout=4,
            headers={"Authorization": f"Bearer {token}"} if token else {},
        )
        result.raise_for_status()
        ids = [entry["id"] for entry in result.json()["data"]]
        model = "ready" if settings.llm_model in ids else "unavailable"
    except (httpx.HTTPError, KeyError, ValueError):
        model = "unavailable"
    return {"app": "ready", "db": db, "model": model, "served_model": settings.llm_model}


@app.get("/api/workspace")
def workspace(request: Request):
    dsn = database_dsn(Settings())
    with ws.connection(dsn) as conn:
        user = accounts.current_user(conn, request)
        row = ws.lookup(conn, user["workspace_id"])
        return ws.snapshot(conn, dsn, row)


@app.get("/api/forecast/chart")
def forecast_chart(request: Request, revision: UUID, quarters: Annotated[int, Query(ge=1, le=4)]):
    with current(request, revision) as (_, dsn, row):
        start = date.fromisoformat(row["settings"]["as_of"])
        years, month = divmod(start.month - 1 + quarters * 3, 12)
        year = start.year + years
        last_day = monthrange(year, month + 1)[1]
        end = date(year, month + 1, min(start.day, last_day))
        settings = dict(row["settings"], horizon_days=(end - start).days)
        return ws.analyse(dsn, dict(row, settings=settings)).forecast


@app.post("/api/forecast")
def forecast(request: Request, body: ForecastChange):
    with current(request, body.revision) as (conn, dsn, row):
        original = row.copy()
        if body.settings != ws.ForecastSettings.model_validate(row["settings"]):
            row["settings"] = body.settings.model_dump(mode="json")
        for field in ("statement", "plan", "invoices"):
            value = getattr(body, field)
            if value is not None:
                conn.execute(
                    "DELETE FROM web_data_files WHERE workspace_id=%s AND kind=%s",
                    (row["id"], field),
                )
                row[field] = None if field == "invoices" and not value else value.encode()
        if original == row:
            return {"revision": body.revision}
        if row["statement"] != original["statement"]:
            row["import_id"], _ = import_statement(
                dsn, row["statement"], scope=str(row["id"]), conn=conn
            )
        ws.analyse(dsn, row)
        ws.advance(conn, row)
    return {"saved": True}


class Upload(Change):
    filename: str = Field(min_length=1, max_length=255)
    content: str = Field(min_length=1)


class MappedUpload(Upload):
    starting_balance: Money | None = None
    mapping: dict[str, str]
    constants: dict[str, str] = Field(default_factory=dict)


class EditPayment(Change):
    source_row: int = Field(ge=2)
    column: str
    value: str = Field(max_length=4000)
    same_type: bool = False
    same_category: bool = False


@app.post("/api/data/{kind}/preview")
def preview_file(request: Request, kind: files.Kind, body: Upload):
    with current(request, body.revision, lock=False):
        headers, rows = files.read_file(body.filename, body.content)
    mapping, model_used = files.suggest(kind, headers)
    return {
        "headers": headers,
        "count": len(rows),
        "sample": rows[:2],
        "mapping": mapping,
        "optional": sorted(files.OPTIONAL[kind]),
        "model_used": model_used,
    }


def replace_data(conn, dsn, row, kind, content, *, edit=False):
    old = row["import_id"]
    row[kind] = content or (None if kind == "invoices" else b"")
    if kind == "statement":
        row["import_id"], _ = import_statement(
            dsn, row["statement"], scope=str(row["id"]), conn=conn
        )
        if edit and old != row["import_id"]:
            conn.execute(
                "INSERT INTO category_overrides SELECT %s,source_row,category "
                "FROM category_overrides WHERE import_id=%s "
                "ON CONFLICT (import_id,source_row) DO UPDATE SET category=excluded.category",
                (row["import_id"], old),
            )
    ws.analyse(dsn, row)
    ws.advance(conn, row)
    if kind == "statement":
        for table in ("category_overrides", "invoice_match_decisions", "transactions"):
            conn.execute(
                f"DELETE FROM {table} WHERE import_id IN "
                "(SELECT id FROM statement_imports WHERE scope=%s AND id<>%s)",
                (str(row["id"]), row["import_id"]),
            )
        conn.execute(
            "DELETE FROM statement_imports WHERE scope=%s AND id<>%s",
            (str(row["id"]), row["import_id"]),
        )


@app.post("/api/data/{kind}/import")
def upload_file(request: Request, kind: files.Kind, body: MappedUpload):
    with current(request, body.revision) as (conn, dsn, row):
        headers, records = files.read_file(body.filename, body.content)
        content = files.canonical(kind, headers, records, body.mapping, body.constants)
        if body.starting_balance is not None:
            if kind != "statement":
                raise ValueError("An opening balance applies only to a bank statement")
            row["settings"] = dict(row["settings"], starting_balance=str(body.starting_balance))
        replace_data(conn, dsn, row, kind, content)
        if kind == "statement" and body.mapping.get("Category"):
            categories = [
                (row["import_id"], i, r[body.mapping["Category"]].strip())
                for i, r in enumerate(records, 2)
                if r[body.mapping["Category"]].strip()
            ]
            if any(len(category) > 100 for _, _, category in categories):
                raise ValueError("Categories must contain up to 100 characters")
            with conn.cursor() as cursor:
                cursor.executemany(
                    "INSERT INTO category_overrides VALUES (%s,%s,%s) "
                    "ON CONFLICT(import_id,source_row) DO UPDATE SET "
                    "category=excluded.category",
                    categories,
                )
        conn.execute(
            "INSERT INTO web_data_files VALUES (%s,%s,%s,%s) "
            "ON CONFLICT(workspace_id,kind) DO UPDATE SET filename=excluded.filename,"
            "original=excluded.original",
            (row["id"], kind, body.filename, body.content.encode()),
        )
    return {"saved": True}


@app.post("/api/data/{kind}/remove")
def remove_file(request: Request, kind: files.Kind, body: Change):
    with current(request, body.revision) as (conn, dsn, row):
        replace_data(conn, dsn, row, kind, None)
        conn.execute(
            "DELETE FROM web_data_files WHERE workspace_id=%s AND kind=%s", (row["id"], kind)
        )
    return {"saved": True}


@app.post("/api/payments/edit")
def edit_payment(request: Request, body: EditPayment):
    with current(request, body.revision) as (conn, dsn, row):
        headers, records = files.active_table("statement", row["statement"])
        if body.source_row > len(records) + 1 or (body.same_type and body.same_category):
            raise ValueError("Select a payment and one edit scope")
        targets = {body.source_row}
        if body.same_type:
            kind = records[body.source_row - 2]["Transaction Type"]
            targets = {
                i for i, record in enumerate(records, 2) if record["Transaction Type"] == kind
            }
        elif body.same_category:
            for group in ws.ledger(dsn, row, full_statement=True).values():
                members = {payment.source_row for payment in group.transactions}
                if body.source_row in members:
                    targets = members
                    break
        if body.column == "category":
            category = body.value.strip()
            if not category or len(category) > 100:
                raise ValueError("Select a payment and enter a category of up to 100 characters")
            conn.execute(
                "INSERT INTO category_overrides (import_id,source_row,category) "
                "SELECT import_id,source_row,%s FROM transactions WHERE import_id=%s "
                "AND source_row=ANY(%s) "
                "ON CONFLICT(import_id,source_row) DO UPDATE SET category=excluded.category",
                (category, row["import_id"], list(targets)),
            )
            ws.advance(conn, row)
            return {"saved": True}
        if body.column not in headers or body.column == "Info":
            raise ValueError("Select a valid payment and editable column")
        value = files.convert(body.column, body.value, "statement")
        for number in targets:
            records[number - 2][body.column] = value
        replace_data(conn, dsn, row, "statement", files.encode(headers, records, ";"), edit=True)
    return {"saved": True}


@app.get("/api/data/{kind}/original")
def original_file(request: Request, kind: files.Kind, revision: UUID):
    with current(request, revision, lock=False) as (conn, _, row):
        file = conn.execute(
            "SELECT filename, original FROM web_data_files WHERE workspace_id=%s AND kind=%s",
            (row["id"], kind),
        ).fetchone()
        if not file:
            raise HTTPException(404, "No uploaded file")
        return Response(
            file["original"],
            media_type="application/octet-stream",
            headers={
                "Content-Disposition": "attachment; filename*=UTF-8''"
                + quote(file["filename"], safe="")
            },
        )


@app.get("/api/data/{kind}/export")
def download_file(
    request: Request, kind: files.Kind, revision: UUID, format: Literal["csv", "txt", "json", "pdf"]
):
    with current(request, revision) as (_, dsn, row):
        if not row[kind]:
            raise HTTPException(404, "No data to export")
        headers, records = files.active_table(kind, row[kind])
        if kind == "statement":
            if "Category" not in headers:
                headers.append("Category")
            for category, group in ws.ledger(dsn, row, full_statement=True).items():
                for payment in group.transactions:
                    records[payment.source_row - 2]["Category"] = category
    if format == "pdf":
        content, mime = files.export_pdf(kind, headers, records), "application/pdf"
    elif format == "json":
        content, mime = json.dumps(records, ensure_ascii=False, indent=2), "application/json"
    else:
        content = files.encode(
            headers, records, "\t" if format == "txt" else files.SEPARATORS[kind]
        )
        mime = "text/plain" if format == "txt" else "text/csv"
    return Response(
        content,
        media_type=mime,
        headers={"Content-Disposition": f'attachment; filename="{kind}.{format}"'},
    )


class PlannedEdit(Change):
    key: str = Field(max_length=100)
    date: date
    amount_eur: Money
    description: str = Field(min_length=1, max_length=1000)
    category: str = Field(min_length=1, max_length=100)


@app.post("/api/plan/edit")
def edit_planned(request: Request, body: PlannedEdit):
    with current(request, body.revision) as (conn, dsn, row):
        analysis = ws.analyse(dsn, row)
        if body.key not in analysis.plan_keys or body.date <= analysis.forecast.as_of:
            raise ValueError("Select a current forecast entry and a date after the cutoff")
        changes = body.model_dump(mode="json", exclude={"key", "revision"})
        current_flow = analysis.plan[analysis.plan_keys.index(body.key)]
        plan_entries = dict(keyed_flows(parse_cash_flow_plan(row["plan"]))) if row["plan"] else {}
        if not current_flow.invoice_id and body.key in plan_entries:
            updated = []
            for key, flow in plan_entries.items():
                if key == body.key:
                    flow = PlannedCashFlow.model_validate(flow.model_dump() | changes)
                updated.append(flow.model_dump(mode="json"))
            row["plan"] = files.encode(files.FIELDS["plan"], updated, ",")
        else:
            row["planned_edits"][body.key] = changes
        ws.analyse(dsn, row)
        ws.advance(conn, row)
    return {"saved": True}


@app.post("/api/categories")
def category(request: Request, body: Category):
    with current(request, body.revision) as (_, dsn, row):
        groups = ws.ledger(dsn, row)
        if not any(
            t.source_row == body.source_row for g in groups.values() for t in g.transactions
        ):
            raise HTTPException(422, "Select a booked payment visible at this cutoff")
        cutoff = date.fromisoformat(row["settings"]["as_of"])
        save_category(
            dsn,
            row["import_id"],
            body.source_row,
            body.category,
            apply_after=cutoff if body.future else None,
        )
    return {"saved": True}


@app.post("/api/invoice-matches")
def match(request: Request, body: Match):
    with current(request, body.revision) as (conn, dsn, row):
        if not row["invoices"]:
            raise HTTPException(422, "Import invoices first")
        save_invoice_decision(
            dsn,
            row["import_id"],
            parse_invoices(row["invoices"]),
            body.invoice_id,
            body.source_row,
            as_of=date.fromisoformat(row["settings"]["as_of"]),
            conn=conn,
        )
        ws.advance(conn, row)
    return {"saved": True}


@app.post("/api/agents/liquidity")
def agent(request: Request, body: Change):
    with current(request, body.revision, lock=False) as (_, dsn, row):
        analysis = ws.analyse(dsn, row)
        request_id = row["liquidity_request"]
        saved = assess(Settings(), analysis, "liquidity", request_id=request_id)
    return {"id": saved.id}


def owned(dsn, row, role):
    rec = find_by_request_id(dsn, row[role + "_request"])
    if not rec:
        raise HTTPException(404, "Run this agent first")
    return rec


@app.post("/api/agents/liquidity/decision/{choice}")
def decision(request: Request, choice: Decision, body: Change):
    with current(request, body.revision) as (_, dsn, row):
        rec = owned(dsn, row, "liquidity")
        return {"status": decide(dsn, rec.id, choice, actor="workspace owner").status}


@app.post("/api/agents/liquidity/comparison")
def comparison(request: Request, body: Terms):
    with current(request, body.revision) as (_, dsn, row):
        rec = owned(dsn, row, "liquidity")
        return compare_scenarios(rec.forecast, rec.recommendation, body.terms)


class CreditScenario(Change):
    product: Literal["overdraft", "credit_line"]
    annual_rate: Decimal = Field(ge=0, le=100, decimal_places=2)


@app.post("/api/agents/liquidity/credit-scenario")
def simulate_credit(request: Request, body: CreditScenario):
    with current(request, body.revision) as (_, dsn, row):
        rec = owned(dsn, row, "liquidity")
        if rec.recommendation.action != "propose_credit":
            raise ValueError("A current credit recommendation is required")
        return credit_path(rec.forecast, rec.recommendation, body.product, body.annual_rate)


if Path("view/dist/index.html").is_file():
    app.mount("/", StaticFiles(directory="view/dist", html=True), name="dashboard")
