from datetime import date
from decimal import Decimal
from pathlib import Path

import pytest

from cfo.finance import daily_balances, validate_proposal
from cfo.ingestion import parse_statement
from cfo.models import ForecastPoint

SAMPLE = Path(__file__).parents[1] / "data/sample/pizzeria-amalfi-2025.csv"


def test_full_sample_and_fx():
    transactions = parse_statement(SAMPLE.read_bytes())
    assert len(transactions) == 1125
    chf = [t for t in transactions if t.currency == "CHF"]
    assert len(chf) == 12
    assert chf[0].amount == Decimal("-4166.67")
    assert chf[0].amount_eur == Decimal("-4341.67")
    points = daily_balances(transactions, Decimal("0"))
    assert len(points) == 365
    assert points[-1].balance == sum((t.amount_eur for t in transactions), Decimal(0))
    assert min(p.balance for p in points) < 0
    assert points[-1].balance == Decimal("30766.35")
    reconciled = daily_balances(transactions, Decimal("2500"))
    assert reconciled[-1].balance == Decimal("33266.35")
    assert min(p.balance for p in reconciled) == Decimal("-22097.60")
    assert next(p.balance for p in reconciled if p.day == date(2025, 6, 30)) == Decimal("-20098.69")


def test_missing_fx_fails_instead_of_summing_currencies():
    content = SAMPLE.read_bytes().replace(b"EUR/CHF", b"UNKNOWN")
    with pytest.raises(ValueError, match="EUR/CHF"):
        parse_statement(content)


def test_future_deficit_blocks_investment_despite_positive_opening():
    points = [
        ForecastPoint(day=date(2025, 6, 1), balance="20000"),
        ForecastPoint(day=date(2025, 6, 28), balance="-1000"),
    ]
    with pytest.raises(ValueError, match="policy"):
        validate_proposal("propose_investment", Decimal("100"), points, Decimal("5000"))
    validate_proposal("propose_credit", Decimal("6000"), points, Decimal("5000"))
    with pytest.raises(ValueError, match="policy"):
        validate_proposal("propose_credit", Decimal("1000"), points, Decimal("5000"))


@pytest.mark.parametrize("opening", ["NaN", "Infinity", "1.001"])
def test_invalid_opening_balance(opening):
    with pytest.raises(ValueError):
        daily_balances(parse_statement(SAMPLE.read_bytes()), Decimal(opening))
