"""Prepare the same dated analysis for both agents and the dashboard."""

from datetime import date
from decimal import Decimal
from hashlib import sha256

from pydantic import BaseModel, ConfigDict

from cfo.agent_types import ReceiptDelay
from cfo.finance import balance_as_of, build_liquidity_forecast
from cfo.ingestion import parse_cash_flow_plan, parse_statement
from cfo.ledger import Reconciliation, parse_invoices, reconcile_invoices
from cfo.models import LiquidityForecast, Money, PlannedCashFlow


class Analysis(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    statement_sha256: str
    starting_balance: Money
    forecast: LiquidityForecast
    plan: list[PlannedCashFlow]
    reconciliation: Reconciliation
    payments_at_risk: list[PlannedCashFlow]
    receipt_delays: list[ReceiptDelay]


def prepare_analysis(
    statement: bytes,
    plan: bytes,
    *,
    as_of: date,
    starting_balance: Decimal,
    horizon_days: int = 45,
    reserve: Decimal = Decimal("0.00"),
    invoices: bytes | None = None,
    confirmed: dict[str, int | None] | None = None,
) -> Analysis:
    """Link plan rows by invoice_id; unlinked rows are independent assumptions."""
    transactions = parse_statement(statement)
    assumptions = parse_cash_flow_plan(plan)
    invoice_rows = parse_invoices(invoices) if invoices is not None else []
    reconciliation = reconcile_invoices(
        transactions, invoice_rows, as_of=as_of, confirmed=confirmed
    )
    by_id = {invoice.invoice_id: invoice for invoice in invoice_rows if invoice.issued_on <= as_of}
    linked = set()
    for row in assumptions:
        if row.invoice_id is None:
            continue
        if row.invoice_id in linked or row.invoice_id not in by_id:
            raise ValueError("Each linked plan entry must identify one distinct imported invoice")
        if by_id[row.invoice_id].amount_eur != row.amount_eur:
            raise ValueError(f"Linked amount differs from invoice {row.invoice_id}")
        linked.add(row.invoice_id)
    flows = [row for row in assumptions if row.invoice_id is None] + reconciliation.planned_flows
    forecast = build_liquidity_forecast(
        as_of=as_of,
        opening_balance=balance_as_of(transactions, starting_balance, as_of),
        planned_flows=flows,
        horizon_days=horizon_days,
        reserve=reserve,
    )
    flows = sorted(
        (flow for flow in flows if as_of < flow.date <= forecast.daily_balances[-1].day),
        key=lambda flow: flow.date,
    )
    # With daily closing balances, same-day payments share one risk date.
    short_days = {point.day for point in forecast.daily_balances if point.balance < reserve}
    risky = [flow for flow in flows if flow.amount_eur < 0 and flow.date in short_days]
    delays = []
    end = forecast.daily_balances[-1].day
    for receipt in reconciliation.planned_flows:
        if receipt.amount_eur <= 0:
            continue
        invoice = by_id[receipt.invoice_id]
        if receipt.date <= invoice.due_on or invoice.due_on > end:
            continue
        pattern = reconciliation.payment_patterns[invoice.counterparty]
        delays.append(
            ReceiptDelay(
                invoice_id=invoice.invoice_id,
                counterparty=invoice.counterparty,
                amount_eur=invoice.amount_eur,
                due_on=invoice.due_on,
                expected_on=receipt.date,
                payments=pattern.payments,
                late_payments=pattern.late_payments,
            )
        )
    return Analysis(
        statement_sha256=sha256(statement).hexdigest(),
        starting_balance=starting_balance,
        forecast=forecast,
        plan=flows,
        reconciliation=reconciliation,
        receipt_delays=delays,
        payments_at_risk=[flow for flow in risky if flow.date == risky[0].date],
    )
