from datetime import date
from decimal import Decimal

import pytest
from pydantic import TypeAdapter

from cfo.ledger import (
    CategoryRule,
    Invoice,
    Reconciliation,
    categorize,
    parse_invoices,
    reconcile_invoices,
)
from cfo.models import Transaction

CUTOFF = date(2025, 5, 31)


def transaction(row, value, amount, reference, *, booked=None):
    return Transaction(
        source_row=row,
        account="demo",
        booked_on=booked or value,
        value_on=value,
        kind="SUPPLIER PAYMENT",
        reference=reference,
        amount=amount,
        currency="EUR",
        amount_eur=amount,
    )


def invoice(key, amount, due, *, issued="2025-05-01"):
    return Invoice(
        invoice_id=key, counterparty="Customer", issued_on=issued, due_on=due, amount_eur=amount
    )


def test_no_double_count_and_payment_history_changes_expected_date():
    txs = [
        transaction(2, "2025-05-12", "100", "Paid INV-12"),
        transaction(3, "2025-05-20", "-40", "Supplier AP-08"),
        transaction(4, "2025-05-29", "130", "INV-13", booked="2025-06-01"),
    ]
    invoices = [
        invoice("INV-12", "100", "2025-05-07"),
        invoice("AP-08", "-40", "2025-05-20"),
        invoice("INV-13", "130", "2025-06-05"),
        invoice("UNKNOWN", "-900", "2025-06-10", issued="2025-06-02"),
    ]
    report = reconcile_invoices(txs, invoices, as_of=CUTOFF)
    assert report.settled == {"INV-12": 2, "AP-08": 3}
    assert report.ambiguous == {}
    assert [(f.invoice_id, f.date, f.amount_eur) for f in report.planned_flows] == [
        ("INV-13", date(2025, 6, 10), Decimal("130"))
    ]
    assert report.payment_patterns["Customer"].late_payments == 1
    assert (
        TypeAdapter(Reconciliation).validate_json(TypeAdapter(Reconciliation).dump_json(report))
        == report
    )


def test_ambiguous_rows_cannot_auto_settle_or_double_allocate():
    txs = [
        transaction(2, "2025-05-12", "100", "INV-1000"),
        transaction(3, "2025-05-13", "100", "anon"),
    ]
    invoices = [invoice("INV-100", "100", "2025-05-20"), invoice("other", "100", "2025-06-20")]
    review = reconcile_invoices(txs, invoices, as_of=CUTOFF)
    assert review.ambiguous == {"INV-100": [2, 3], "other": [2, 3]}
    assert review.planned_flows == []
    assert set(review.unprojected_receivables) == {"INV-100", "other"}
    with pytest.raises(ValueError, match="already used"):
        reconcile_invoices(txs, invoices, as_of=CUTOFF, confirmed={"INV-100": 2, "other": 2})
    done = reconcile_invoices(txs, invoices, as_of=CUTOFF, confirmed={"INV-100": 3, "other": None})
    assert done.settled == {"INV-100": 3}
    assert [(f.invoice_id, f.amount_eur) for f in done.planned_flows] == [("other", Decimal(100))]


def test_category_drilldown_and_override_precedence():
    txs = [
        transaction(2, "2025-05-10", "-40", "A"),
        transaction(3, "2025-05-11", "-40", "B"),
        transaction(4, "2025-05-15", "-70", "C"),
        transaction(5, "2025-05-17", "-20", "D"),
    ]
    groups = categorize(
        txs,
        overrides={4: "Equipment"},
        rules=[CategoryRule("demo", "SUPPLIER PAYMENT", date(2025, 5, 11), "Ingredients")],
    )
    assert groups["Supplies"].amount_eur == Decimal("-80")
    assert [t.source_row for t in groups["Supplies"].transactions] == [2, 3]
    assert groups["Ingredients"].transactions == [txs[3]]
    assert groups["Equipment"].transactions == [txs[2]]


def test_signed_csv_invoice_validated():
    header = b"invoice_id;counterparty;issued_on;due_on;amount_eur\n"
    line = b"AB;Bakery;2025-05-20;2025-05-22;-20,50\n"
    assert parse_invoices(header + line)[0].amount_eur == Decimal("-20.50")
    with pytest.raises(ValueError, match="unique"):
        parse_invoices(header + line + line)


def test_malformed_invoice_rows_fail_before_forecast():
    header = b"invoice_id;counterparty;issued_on;due_on;amount_eur\n"
    for bad in (b'"A;Broken\n', b"A;Party;2025-01-01;2025-02-01;50;extra\n"):
        with pytest.raises(ValueError):
            parse_invoices(header + bad)
