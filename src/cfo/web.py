"""Same-origin React dashboard and PostgreSQL-backed CFO API."""

import os
from collections.abc import Iterator
from contextlib import contextmanager
from datetime import date
from decimal import ROUND_HALF_UP, Decimal, localcontext
from pathlib import Path
from typing import Annotated, Literal
from uuid import UUID

import httpx
import psycopg
from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from psycopg.types.json import Jsonb
from pydantic import BaseModel, ConfigDict, Field

from cfo import workspace as ws
from cfo.agent_types import Role
from cfo.config import Settings
from cfo.db import import_statement
from cfo.ledger import parse_invoices, save_category, save_invoice_decision
from cfo.llm import ModelError
from cfo.models import Money
from cfo.scenarios import SettlementTerms, compare_scenarios
from cfo.service import assess, database_dsn
from cfo.workflow import Decision, decide, find_by_request_id

app = FastAPI(title="Autonomous CFO")
COOKIE = "cfo_workspace"
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


@app.exception_handler(ValueError)
async def invalid_input(request, exc):
    if isinstance(exc, ModelError):
        return JSONResponse({"detail": str(exc), "code": exc.code}, status_code=503)
    return JSONResponse({"detail": str(exc)}, status_code=422)


@app.exception_handler(psycopg.OperationalError)
async def database_unavailable(request, exc):
    return JSONResponse({"detail": "PostgreSQL is unavailable"}, status_code=503)


def workspace_id(request):
    try:
        return UUID(request.cookies.get(COOKIE, ""))
    except ValueError:
        return None


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


class Simulation(Change):
    kind: Literal["fx_forward", "tax_prepayment", "money_market", "capex"]
    amount: Annotated[Money, Field(gt=0)]
    effective_on: date
    eur_per_chf: Annotated[Decimal | None, Field(gt=0, max_digits=12, decimal_places=6)] = None


@contextmanager
def current(request, revision, *, lock=True) -> Iterator:
    dsn = database_dsn(Settings())
    with ws.connection(dsn) as conn:
        row = ws.lookup(conn, workspace_id(request), lock=lock)
        if not row or row["revision"] != revision:
            raise HTTPException(409, "Forecast changed. Refresh the workspace and try again.")
        yield conn, dsn, row


@app.get("/api/live")
def live():
    return {"app": "ready"}


@app.get("/api/ready")
def ready():
    with ws.connection(database_dsn(Settings())) as conn:
        conn.execute("SELECT revision FROM web_workspaces LIMIT 0")
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
def workspace(request: Request, response: Response):
    dsn = database_dsn(Settings())
    with ws.connection(dsn) as conn:
        row = ws.lookup(conn, workspace_id(request), lock=True)
        if not row:
            key = ws.create_workspace(conn, dsn)
            response.set_cookie(
                COOKIE,
                str(key),
                httponly=True,
                samesite="strict",
                secure=os.getenv("CFO_SECURE_COOKIE") == "1",
                max_age=30 * 86400,
            )
            row = ws.lookup(conn, key)
        return ws.snapshot(conn, dsn, row)


@app.post("/api/forecast")
def forecast(request: Request, body: ForecastChange):
    with current(request, body.revision) as (conn, dsn, row):
        original = row.copy()
        if body.settings != ws.ForecastSettings.model_validate(row["settings"]):
            row["settings"] = body.settings.model_dump(mode="json")
        for field in ("statement", "plan", "invoices"):
            value = getattr(body, field)
            if value is not None:
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


@app.post("/api/agents/{role}")
def agent(request: Request, role: Role, body: Change):
    with current(request, body.revision, lock=False) as (_, dsn, row):
        analysis = ws.analyse(dsn, row)
        request_id = row[role + "_request"]
    saved = assess(Settings(), analysis, role, request_id=request_id)
    return {"id": saved.id}


def owned(dsn, row, role):
    rec = find_by_request_id(dsn, row[role + "_request"])
    if not rec:
        raise HTTPException(404, "Run this agent first")
    return rec


@app.post("/api/agents/{role}/decision/{choice}")
def decision(request: Request, role: Role, choice: Decision, body: Change):
    with current(request, body.revision) as (_, dsn, row):
        rec = owned(dsn, row, role)
        return {"status": decide(dsn, rec.id, choice, actor="workspace owner").status}


@app.post("/api/agents/{role}/comparison")
def comparison(request: Request, role: Role, body: Terms):
    with current(request, body.revision) as (_, dsn, row):
        rec = owned(dsn, row, role)
        return compare_scenarios(rec.forecast, rec.recommendation, body.terms)


@app.post("/api/simulations")
def simulation(request: Request, body: Simulation):
    with current(request, body.revision) as (conn, dsn, row):
        cutoff = date.fromisoformat(row["settings"]["as_of"])
        if body.effective_on <= cutoff:
            raise ValueError("Choose a date after the forecast cutoff")
        basis = body.model_dump(mode="json", exclude={"kind", "revision"}, exclude_none=True)
        basis["amount"] = format(body.amount, ".2f")
        if body.kind == "fx_forward":
            if body.eur_per_chf is None:
                raise ValueError("Enter an assumed EUR price per CHF")
            basis["eur_per_chf"] = format(body.eur_per_chf.normalize(), "f")
            with localcontext() as context:
                context.prec = 32
                estimate = body.amount * body.eur_per_chf
                basis["estimated_eur"] = format(
                    estimate.quantize(Decimal(".01"), rounding=ROUND_HALF_UP), "f"
                )
        elif body.eur_per_chf is not None:
            raise ValueError("An FX rate only applies to a forward")
        if body.kind == "money_market":
            rec = owned(dsn, row, "investment").recommendation
            if body.amount > (rec.free_cash or 0):
                raise ValueError("Amount exceeds assessed free cash")
        result = conn.execute(
            "INSERT INTO web_simulations(revision,kind,basis) VALUES (%s,%s,%s) "
            "ON CONFLICT (revision,kind,basis) DO UPDATE SET kind=excluded.kind RETURNING id",
            (body.revision, body.kind, Jsonb(basis)),
        ).fetchone()
        return {"id": result["id"]}


if Path("view/dist/index.html").is_file():
    app.mount("/", StaticFiles(directory="view/dist", html=True), name="dashboard")
