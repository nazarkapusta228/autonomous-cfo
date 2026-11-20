"""Single-statement invoice reconciliation and owner-maintained payment categories."""

import csv
import hashlib
import json
import re
from collections import defaultdict
from collections.abc import Iterable, Mapping
from dataclasses import dataclass
from datetime import date, timedelta
from decimal import Decimal
from io import StringIO
from math import ceil
from statistics import median

import psycopg
from psycopg.rows import dict_row
from pydantic import BaseModel, ConfigDict, Field, model_validator

from cfo.models import Money, PlannedCashFlow, Transaction


class Invoice(BaseModel):
    """Signed EUR amount: a receivable is positive, a payable is negative."""

    model_config = ConfigDict(frozen=True, extra="forbid", str_strip_whitespace=True)

    invoice_id: str = Field(min_length=1)
    counterparty: str = Field(min_length=1)
    issued_on: date
    due_on: date
    amount_eur: Money

    @model_validator(mode="after")
    def check_dates(self):
        if self.due_on < self.issued_on or not self.amount_eur:
            raise ValueError("An invoice needs a nonzero amount and due date on/after issue")
        return self


def parse_invoices(content: bytes) -> list[Invoice]:
    """Read UTF-8 invoice CSV with a semicolon separator and decimal point or comma."""
    reader = csv.DictReader(StringIO(content.decode("utf-8-sig")), delimiter=";", strict=True)
    try:
        if sorted(reader.fieldnames or []) != sorted(Invoice.model_fields):
            raise ValueError("Expected invoice columns: " + ", ".join(Invoice.model_fields))
        invoices = []
        for row in reader:
            if None in row or None in row.values():
                raise ValueError(f"Invalid invoice column count at line {reader.line_num}")
            try:
                row["amount_eur"] = row["amount_eur"].replace(",", ".")
                invoices.append(Invoice.model_validate(row))
            except ValueError as exc:
                raise ValueError(f"Invalid invoice at line {reader.line_num}") from exc
    except csv.Error as exc:
        raise ValueError(f"Invalid invoice CSV near line {reader.line_num}") from exc
    _unique_invoices(invoices)
    return invoices


def _unique_invoices(invoices):
    if len({i.invoice_id.casefold() for i in invoices}) != len(invoices):
        raise ValueError("Invoice IDs must be unique")


@dataclass(frozen=True)
class PaymentPattern:
    payments: int
    late_payments: int
    median_delay_days: int


@dataclass(frozen=True)
class Reconciliation:
    settled: dict[str, int]  # Invoice ID -> bank-confirmed source row
    ambiguous: dict[str, list[int]]  # Only unresolved matches for owner review
    outstanding: list[Invoice]
    payment_patterns: dict[str, PaymentPattern]
    planned_flows: list[PlannedCashFlow]
    unprojected_receivables: list[str]


def reconcile_invoices(
    transactions: list[Transaction],
    invoices: list[Invoice],
    *,
    as_of: date,
    confirmed: Mapping[str, int | None] | None = None,
) -> Reconciliation:
    """Match a single import. A None decision keeps the invoice outstanding."""
    _unique_invoices(invoices)
    if len({t.account for t in transactions}) > 1:
        raise ValueError("Reconcile one account at a time")
    if len({t.source_row for t in transactions}) != len(transactions):
        raise ValueError("Reconcile one statement import at a time")
    known = {i.invoice_id: i for i in invoices if i.issued_on <= as_of}
    booked = {t.source_row: t for t in transactions if max(t.booked_on, t.value_on) <= as_of}
    decisions = dict(confirmed or {})
    settled: dict[str, int] = {}
    for key, row in decisions.items():
        if key not in known:
            raise ValueError("Decision refers to an unknown invoice at this cutoff")
        if row is None:
            continue
        if row not in booked or row in settled.values():
            raise ValueError("Settlement row is unavailable or already used")
        if (
            booked[row].amount_eur != known[key].amount_eur
            or booked[row].value_on < known[key].issued_on
        ):
            raise ValueError("Settlement row does not match invoice date/amount")
        settled[key] = row

    remaining = [i for i in known.values() if i.invoice_id not in decisions]
    occupied = set(settled.values())
    by_amount = defaultdict(list)
    for row, transaction in booked.items():
        if row not in occupied:
            by_amount[transaction.amount_eur].append(transaction)
    exact = {}
    possible = {}
    claims = defaultdict(list)
    for invoice in remaining:
        key = invoice.invoice_id
        marker = re.compile(r"(?<![\w-])" + re.escape(key) + r"(?![\w-])", re.IGNORECASE)
        candidates = [t for t in by_amount[invoice.amount_eur] if t.value_on >= invoice.issued_on]
        possible[key] = [t.source_row for t in candidates]
        exact[key] = [t.source_row for t in candidates if marker.search(t.reference)]
        for row in exact[key]:
            claims[row].append(key)
    for key, rows in exact.items():
        if len(rows) == 1 and len(claims[rows[0]]) == 1:
            settled[key] = rows[0]
    occupied = set(settled.values())
    ambiguous = {}
    for invoice in remaining:
        key = invoice.invoice_id
        if key not in settled:
            rows = [r for r in (exact[key] or possible[key]) if r not in occupied]
            if rows:
                ambiguous[key] = rows

    delays = defaultdict(list)
    for key, row in settled.items():
        invoice = known[key]
        if invoice.amount_eur > 0:
            delays[invoice.counterparty].append(
                max(0, (booked[row].value_on - invoice.due_on).days)
            )
    patterns = {
        party: PaymentPattern(len(days), sum(d > 0 for d in days), ceil(median(days)))
        for party, days in delays.items()
    }
    outstanding = [invoice for key, invoice in known.items() if key not in settled]
    flows = []
    unprojected = []
    for invoice in outstanding:
        inflow = invoice.amount_eur > 0
        expected = invoice.due_on
        if inflow and invoice.counterparty in patterns:
            expected += timedelta(days=patterns[invoice.counterparty].median_delay_days)
        if inflow and (expected <= as_of or invoice.invoice_id in ambiguous):
            unprojected.append(invoice.invoice_id)
            continue
        # Reserve for overdue payables on the first forecast day.
        flows.append(
            PlannedCashFlow(
                date=max(expected, as_of + timedelta(days=1)),
                invoice_id=invoice.invoice_id,
                amount_eur=invoice.amount_eur,
                category="receivables" if inflow else "payables",
                description="Expected invoice receipt" if inflow else "Planned invoice payment",
            )
        )
    return Reconciliation(settled, ambiguous, outstanding, patterns, flows, unprojected)


DEFAULT_CATEGORIES = {
    "CARD SETTLEMENT (DEBIT)": "Card revenue",
    "CREDIT CARD PAYOUT": "Card revenue",
    "SUPPLIER PAYMENT": "Supplies",
    "GIRO CARD PAYMENT": "Card purchases",
    "SALARY PAYMENT": "Payroll",
    "TAX OFFICE TRANSFER": "Taxes",
    "RENT PAYMENT": "Rent",
    "DIRECT DEBIT": "Direct debits",
    "INTERNATIONAL WIRE TRANSFER": "International transfers",
}


@dataclass(frozen=True)
class CategoryRule:
    account: str
    kind: str
    effective_after: date
    category: str


@dataclass
class CategoryGroup:
    amount_eur: Decimal
    transactions: list[Transaction]


def _default_category(t: Transaction) -> str:
    if t.kind == "DIRECT DEBIT":
        ref = t.reference.casefold()
        for marker, category in (
            ("tax prepayment", "Taxes"),
            ("social security", "Payroll contributions"),
            ("energy & gas", "Utilities"),
        ):
            if marker in ref:
                return category
    return DEFAULT_CATEGORIES.get(t.kind, "Other")


def categorize(
    transactions: list[Transaction],
    *,
    overrides: Mapping[int, str] | None = None,
    rules: Iterable[CategoryRule] = (),
    as_of: date | None = None,
) -> dict[str, CategoryGroup]:
    """Summarize one statement; an individual override wins over dated kind rules."""
    if len({t.account for t in transactions}) > 1:
        raise ValueError("Categorize one account at a time")
    result = {}
    newest = sorted(rules, key=lambda r: r.effective_after, reverse=True)
    for t in transactions:
        if as_of and max(t.booked_on, t.value_on) > as_of:
            continue
        category = (overrides or {}).get(t.source_row)
        if category is None:
            category = next(
                (
                    r.category
                    for r in newest
                    if r.account == t.account
                    and r.kind == t.kind
                    and t.booked_on > r.effective_after
                ),
                _default_category(t),
            )
        group = result.setdefault(category, CategoryGroup(Decimal(0), []))
        group.transactions.append(t)
        group.amount_eur += t.amount_eur
    return result


def save_category(
    database_url: str,
    import_id: int,
    source_row: int,
    category: str,
    *,
    apply_after: date | None = None,
) -> None:
    """Correct the selected payment and optionally future payments of the same kind/account."""
    category = category.strip()
    if not category:
        raise ValueError("Category must be nonempty")
    with psycopg.connect(database_url) as conn:
        result = conn.execute(
            "SELECT account, kind, booked_on FROM transactions "
            "WHERE import_id = %s AND source_row = %s",
            (import_id, source_row),
        ).fetchone()
        if result is None:
            raise ValueError("Unknown statement row")
        account, kind, booked_on = result
        if apply_after and apply_after < booked_on:
            raise ValueError("Future rule cannot start before the selected payment")
        conn.execute(
            "INSERT INTO category_overrides(import_id, source_row, category) "
            "VALUES (%s,%s,%s) ON CONFLICT (import_id,source_row) "
            "DO UPDATE SET category = excluded.category",
            (import_id, source_row, category),
        )
        if apply_after:
            conn.execute(
                "INSERT INTO category_rules(account,kind,effective_after,category) "
                "VALUES (%s,%s,%s,%s) ON CONFLICT (account,kind,effective_after) "
                "DO UPDATE SET category = excluded.category",
                (account, kind, apply_after, category),
            )


def load_categories(database_url: str, import_id: int) -> tuple[dict[int, str], list[CategoryRule]]:
    """Return per-row corrections and date-scoped rules for this statement account."""
    with psycopg.connect(database_url) as conn:
        overrides = dict(
            conn.execute(
                "SELECT source_row,category FROM category_overrides WHERE import_id=%s",
                (import_id,),
            )
        )
        rules = [
            CategoryRule(*r)
            for r in conn.execute(
                "SELECT account,kind,effective_after,category FROM category_rules "
                "WHERE account IN (SELECT account FROM transactions WHERE import_id=%s)",
                (import_id,),
            )
        ]
    return overrides, rules


def _invoice_digest(invoices: list[Invoice], as_of: date) -> str:
    _unique_invoices(invoices)
    snapshot = [
        i.model_dump(mode="json")
        for i in sorted(invoices, key=lambda i: i.invoice_id)
        if i.issued_on <= as_of
    ]
    return hashlib.sha256(json.dumps(snapshot, sort_keys=True).encode()).hexdigest()


def load_invoice_decisions(
    database_url: str, import_id: int, invoices: list[Invoice], *, as_of: date
) -> dict[str, int | None]:
    """Restore confirmed rows and explicit outstanding decisions for identical inputs."""
    digest = _invoice_digest(invoices, as_of)
    with psycopg.connect(database_url) as conn:
        return dict(
            conn.execute(
                "SELECT invoice_id,source_row FROM invoice_match_decisions "
                "WHERE import_id=%s AND invoice_digest=%s AND as_of=%s",
                (import_id, digest, as_of),
            )
        )


def save_invoice_decision(
    database_url: str,
    import_id: int,
    invoices: list[Invoice],
    invoice_id: str,
    source_row: int | None,
    *,
    as_of: date,
) -> None:
    """Accept a candidate or mark it outstanding, binding decisions to this cutoff and input."""
    digest = _invoice_digest(invoices, as_of)
    with psycopg.connect(database_url) as conn:
        if not conn.execute(
            "SELECT id FROM statement_imports WHERE id=%s FOR UPDATE", (import_id,)
        ).fetchone():
            raise ValueError("Unknown statement import")
        with conn.cursor(row_factory=dict_row) as cursor:
            cursor.execute(
                "SELECT source_row, account, booked_on, value_on, kind, reference, "
                "amount, currency, amount_eur FROM transactions WHERE import_id=%s "
                "AND booked_on<=%s AND value_on<=%s",
                (import_id, as_of, as_of),
            )
            transactions = [Transaction.model_validate(row) for row in cursor]
        decisions = dict(
            conn.execute(
                "SELECT invoice_id,source_row FROM invoice_match_decisions "
                "WHERE import_id=%s AND invoice_digest=%s AND as_of=%s",
                (import_id, digest, as_of),
            )
        )
        if invoice_id in decisions and decisions[invoice_id] == source_row:
            return
        decisions.pop(invoice_id, None)
        report = reconcile_invoices(transactions, invoices, as_of=as_of, confirmed=decisions)
        candidates = report.ambiguous.get(invoice_id)
        if not candidates or (source_row is not None and source_row not in candidates):
            raise ValueError("This invoice has no such ambiguous settlement candidate")
        conn.execute(
            "INSERT INTO invoice_match_decisions "
            "(import_id,invoice_digest,as_of,invoice_id,source_row) VALUES (%s,%s,%s,%s,%s) "
            "ON CONFLICT (import_id,invoice_digest,as_of,invoice_id) "
            "DO UPDATE SET source_row=excluded.source_row",
            (import_id, digest, as_of, invoice_id, source_row),
        )
