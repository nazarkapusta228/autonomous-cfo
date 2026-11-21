from datetime import date
from decimal import Decimal
from pathlib import Path

import pytest

from cfo.analysis import statement_projection
from cfo.finance import balance_as_of, build_liquidity_forecast, daily_balances, validate_proposal
from cfo.ingestion import parse_cash_flow_plan, parse_statement
from cfo.models import ForecastPoint, PlannedCashFlow

SAMPLE = Path(__file__).parents[1] / "data/sample/pizzeria-amalfi-2025.csv"
CUTOFF = date(2025, 5, 31)


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


def test_demo_forecast_uses_only_history_known_at_cutoff():
    transactions = parse_statement(SAMPLE.read_bytes())
    opening = Decimal("2500.00")
    cutoff_balance = balance_as_of(transactions, opening, CUTOFF)
    assert cutoff_balance == Decimal("2006.31")
    historical = [
        item for item in transactions if item.booked_on <= CUTOFF and item.value_on <= CUTOFF
    ]
    # Transactions only known or valued after cutoff must both be excluded.
    late_booked = historical[-1].model_copy(update={"booked_on": date(2025, 6, 1)})
    late_valued = historical[-1].model_copy(update={"value_on": date(2025, 6, 1)})
    assert balance_as_of([*historical, late_booked, late_valued], opening, CUTOFF) == cutoff_balance

    forecast = build_liquidity_forecast(
        as_of=CUTOFF,
        opening_balance=cutoff_balance,
        planned_flows=statement_projection(transactions, CUTOFF, 45),
    )
    assert len(forecast.daily_balances) == 45
    assert forecast.daily_balances[0].day == date(2025, 6, 1)
    assert forecast.daily_balances[0].balance == Decimal("2325.27")
    assert forecast.daily_balances[-1].day == date(2025, 7, 15)
    assert forecast.daily_balances[-1].balance == Decimal("10722.88")
    assert forecast.minimum_balance == Decimal("2065.49")
    assert forecast.funding_needed == 0
    assert statement_projection(historical, CUTOFF, 45) == statement_projection(
        transactions, CUTOFF, 45
    )


def test_forecast_rolls_up_same_day_flows_and_keeps_first_date_for_tied_minimum():
    rent = PlannedCashFlow(
        date=date(2025, 6, 1), category="rent", amount_eur="-250", description="Rent"
    )
    revenue = PlannedCashFlow(
        date=date(2025, 6, 1), category="revenue", amount_eur="50", description="Sales"
    )
    outside_horizon = rent.model_copy(update={"date": date(2025, 6, 3)})
    forecast = build_liquidity_forecast(
        as_of=CUTOFF,
        opening_balance=Decimal("100"),
        planned_flows=[outside_horizon, revenue, rent],
        horizon_days=2,
    )
    assert [point.balance for point in forecast.daily_balances] == [Decimal("-100")] * 2
    assert forecast.first_deficit_on == forecast.minimum_on == date(2025, 6, 1)
    assert forecast.funding_needed_by == date(2025, 6, 1)
    assert forecast.funding_needed == Decimal("100")
    assert forecast.drivers == [rent]


@pytest.mark.parametrize(
    ("opening", "reserve", "needed", "needed_by"),
    [("0", "0", "0", None), ("-200", "0", "200", CUTOFF), ("100", "200", "100", CUTOFF)],
)
def test_funding_accounts_for_the_opening_balance(opening, reserve, needed, needed_by):
    revenue = PlannedCashFlow(
        date=date(2025, 6, 1), category="revenue", amount_eur="300", description="Sales"
    )
    forecast = build_liquidity_forecast(
        as_of=CUTOFF,
        opening_balance=Decimal(opening),
        planned_flows=[revenue],
        horizon_days=2,
        reserve=Decimal(reserve),
    )
    assert forecast.first_deficit_on is None
    assert forecast.funding_needed == Decimal(needed)
    assert forecast.funding_needed_by == needed_by
    assert forecast.drivers == []


def test_plan_validation_identifies_the_bad_csv_row():
    with pytest.raises(ValueError, match="Cash flow plan row 2"):
        parse_cash_flow_plan(
            b"date,category,amount_eur,description\n2025-06-01,rent,-20.001,Monthly rent\n"
        )
