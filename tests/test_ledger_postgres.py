"""Persistence and snapshot isolation of manual invoice and category decisions."""

from datetime import date
from pathlib import Path

import pytest

from cfo.db import import_statement
from cfo.ingestion import parse_statement
from cfo.ledger import (
    Invoice,
    categorize,
    load_categories,
    load_invoice_decisions,
    reconcile_invoices,
    save_category,
    save_invoice_decision,
)

SAMPLE = Path(__file__).parents[1] / "data/sample/pizzeria-amalfi-2025.csv"


def test_ledger_owner_edits_survive_reload(postgres_url):
    data = SAMPLE.read_bytes()
    import_id, _ = import_statement(postgres_url, data)
    transactions = parse_statement(data)
    tx = next(t for t in transactions if t.kind == "SUPPLIER PAYMENT")
    invoice = Invoice(
        invoice_id="MANUAL-MATCH",
        counterparty="Sample supplier",
        issued_on=tx.booked_on,
        due_on=tx.value_on,
        amount_eur=tx.amount_eur,
    )
    cutoff = date(2025, 5, 31)
    args = postgres_url, import_id, [invoice]
    unknown = reconcile_invoices(transactions, [invoice], as_of=cutoff)
    assert tx.source_row in unknown.ambiguous[invoice.invoice_id]
    with pytest.raises(ValueError, match="candidate"):
        save_invoice_decision(*args, invoice.invoice_id, -1, as_of=cutoff)
    save_invoice_decision(*args, invoice.invoice_id, tx.source_row, as_of=cutoff)
    chosen = load_invoice_decisions(*args, as_of=cutoff)
    assert chosen == {invoice.invoice_id: tx.source_row}
    assert not reconcile_invoices(
        transactions, [invoice], as_of=cutoff, confirmed=chosen
    ).planned_flows
    assert not load_invoice_decisions(*args, as_of=date(2025, 5, 30))
    changed = invoice.model_copy(update={"counterparty": "Other supplier"})
    assert not load_invoice_decisions(postgres_url, import_id, [changed], as_of=cutoff)

    save_category(postgres_url, import_id, tx.source_row, "Food", apply_after=tx.booked_on)
    overrides, rules = load_categories(postgres_url, import_id)
    group = categorize(transactions, overrides=overrides, rules=rules)["Food"]
    assert tx in group.transactions
    assert any(t.booked_on > tx.booked_on for t in group.transactions)
    assert all(t.kind == tx.kind for t in group.transactions)
