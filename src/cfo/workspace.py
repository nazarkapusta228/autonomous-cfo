"""Browser-owned forecast inputs and their immutable agent request identities."""

from datetime import date
from decimal import Decimal
from functools import lru_cache
from pathlib import Path
from typing import Annotated
from uuid import UUID, uuid4

import psycopg
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb
from pydantic import BaseModel, ConfigDict, Field

from cfo.analysis import prepare_analysis
from cfo.db import import_statement
from cfo.finance import daily_balances
from cfo.ingestion import parse_statement
from cfo.ledger import categorize, load_categories, load_invoice_decisions, parse_invoices
from cfo.models import Money
from cfo.workflow import find_by_request_id


class ForecastSettings(BaseModel):
    model_config = ConfigDict(extra="forbid")
    as_of: date = date(2025, 5, 31)
    starting_balance: Money = Decimal("2500.00")
    reserve: Annotated[Money, Field(ge=0)] = Decimal("0.00")
    horizon_days: int = Field(default=45, ge=1, le=366)


def connection(dsn):
    return psycopg.connect(dsn, row_factory=dict_row, connect_timeout=4)


@lru_cache(maxsize=1)
def sample():
    base = Path("data/sample")
    return (
        (base / "pizzeria-amalfi-2025.csv").read_bytes(),
        b"",
    )


def new_revision(conn, workspace, revision):
    conn.execute(
        "INSERT INTO web_revisions (id,workspace_id,liquidity_request,investment_request) "
        "VALUES (%s,%s,%s,%s)",
        (revision, workspace, uuid4(), uuid4()),
    )


def create_workspace(conn, dsn):
    workspace, revision = uuid4(), uuid4()
    statement, plan = sample()
    import_id, _ = import_statement(dsn, statement, scope=str(workspace), conn=conn)
    conn.execute(
        "INSERT INTO web_workspaces (id,revision,import_id,statement,plan,settings) "
        "VALUES (%s,%s,%s,%s,%s,%s)",
        (
            workspace,
            revision,
            import_id,
            statement,
            plan,
            Jsonb(ForecastSettings().model_dump(mode="json")),
        ),
    )
    new_revision(conn, workspace, revision)
    return workspace


def lookup(conn, workspace: UUID | None, *, lock=False):
    if not workspace:
        return None
    return conn.execute(
        "SELECT w.*, r.liquidity_request,r.investment_request FROM web_workspaces w "
        "JOIN web_revisions r ON r.id=w.revision WHERE w.id=%s"
        + (" FOR UPDATE OF w" if lock else ""),
        (workspace,),
    ).fetchone()


def advance(conn, row):
    revision = uuid4()
    new_revision(conn, row["id"], revision)
    conn.execute(
        "UPDATE web_workspaces SET revision=%s,import_id=%s,statement=%s,plan=%s,"
        "invoices=%s,settings=%s WHERE id=%s",
        (
            revision,
            row["import_id"],
            row["statement"],
            row["plan"],
            row["invoices"],
            Jsonb(row["settings"]),
            row["id"],
        ),
    )


def analyse(dsn, row):
    settings = ForecastSettings.model_validate(row["settings"])
    matches = {}
    if row["invoices"]:
        matches = load_invoice_decisions(
            dsn, row["import_id"], parse_invoices(row["invoices"]), as_of=settings.as_of
        )
    return prepare_analysis(
        row["statement"],
        row["plan"],
        invoices=row["invoices"],
        confirmed=matches,
        **settings.model_dump(),
    )


def ledger(dsn, row, transactions=None, *, full_statement=False):
    overrides, rules = load_categories(dsn, row["import_id"])
    return categorize(
        parse_statement(row["statement"]) if transactions is None else transactions,
        overrides=overrides,
        rules=rules,
        as_of=None if full_statement else ForecastSettings.model_validate(row["settings"]).as_of,
    )


def snapshot(conn, dsn, row):
    analysis = analyse(dsn, row)
    transactions = parse_statement(row["statement"])
    groups = ledger(dsn, row, transactions, full_statement=True)
    cutoff = analysis.forecast.as_of
    records = sorted(
        (
            dict(t.model_dump(mode="json"), category=name)
            for name, group in groups.items()
            for t in group.transactions
        ),
        key=lambda t: (t["value_on"], t["source_row"]),
        reverse=True,
    )
    visible = [t for t in transactions if max(t.booked_on, t.value_on) <= cutoff]
    visible_rows = {t.source_row for t in visible}
    category_totals = {}
    for record in records:
        if record["source_row"] in visible_rows:
            name = record["category"]
            category_totals[name] = category_totals.get(name, Decimal(0)) + Decimal(
                record["amount_eur"]
            )
    history = daily_balances(transactions, analysis.starting_balance) if transactions else []
    foreign = sorted((t for t in visible if t.currency == "CHF"), key=lambda t: t.value_on)
    fx = {
        "booked_chf": str(sum((t.amount for t in foreign), Decimal(0))),
        "booked_eur": str(sum((t.amount_eur for t in foreign), Decimal(0))),
        "rates": [
            {"day": t.value_on, "rate": str(t.booked_rate)}
            for t in foreign
            if t.booked_rate is not None
        ],
    }
    assessments = {}
    for role in ("liquidity", "investment"):
        saved = find_by_request_id(dsn, row[role + "_request"])
        if saved:
            assessments[role] = saved.model_dump(
                mode="json", exclude={"context", "forecast", "request_id"}
            )
    audit = conn.execute(
        "SELECT e.occurred_at,r.agent AS kind,e.event,r.id AS number FROM web_revisions v "
        "JOIN recommendations r ON r.request_id IN (v.liquidity_request,v.investment_request) "
        "JOIN audit_events e ON e.recommendation_id=r.id WHERE v.workspace_id=%s "
        "UNION ALL SELECT s.created_at,s.kind,'simulated',s.id FROM web_simulations s "
        "JOIN web_revisions v ON v.id=s.revision WHERE v.workspace_id=%s ORDER BY 1 DESC",
        (row["id"], row["id"]),
    ).fetchall()
    simulations = conn.execute(
        "SELECT id,kind,basis,created_at FROM web_simulations WHERE revision=%s ORDER BY id DESC",
        (row["revision"],),
    ).fetchall()
    statement_info = conn.execute(
        "SELECT count(*) AS total, max(greatest(booked_on,value_on)) AS last_date "
        "FROM transactions WHERE import_id=%s",
        (row["import_id"],),
    ).fetchone()
    names = {
        r["kind"]: r["filename"]
        for r in conn.execute(
            "SELECT kind, filename FROM web_data_files WHERE workspace_id=%s", (row["id"],)
        )
    }
    return dict(
        data_files={
            f: {"present": bool(row[f]), "filename": names.get(f)}
            for f in ("statement", "plan", "invoices")
        },
        statement_info=statement_info,
        uses_statement_projection=not row["plan"],
        revision=row["revision"],
        settings=row["settings"],
        analysis=analysis.model_dump(mode="json"),
        statement_rows=records,
        transactions=[r for r in records if r["source_row"] in visible_rows],
        fx=fx,
        categories={k: str(v) for k, v in category_totals.items()},
        assessments=assessments,
        audit=audit,
        simulations=simulations,
        history=[p.model_dump(mode="json") for p in history],
        has_invoices=row["invoices"] is not None,
    )
