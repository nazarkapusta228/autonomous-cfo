from collections import defaultdict
from datetime import date, timedelta
from decimal import Decimal

from cfo.models import ForecastPoint, LiquidityForecast, PlannedCashFlow, Transaction


def daily_balances(transactions: list[Transaction], opening: Decimal) -> list[ForecastPoint]:
    """Opening balance is immediately before the earliest value date."""
    if not transactions:
        raise ValueError("No transactions")
    if not opening.is_finite() or opening != opening.quantize(Decimal("0.01")):
        raise ValueError("Opening balance must be finite with at most two decimal places")
    if len({item.account for item in transactions}) != 1:
        raise ValueError("Balances require a single account")
    changes: dict[date, Decimal] = defaultdict(lambda: Decimal("0.00"))
    for item in transactions:
        changes[item.value_on] += item.amount_eur
    day, end = min(changes), max(changes)
    balance = opening
    points = []
    while day <= end:
        balance += changes[day]
        points.append(ForecastPoint(day=day, balance=balance))
        day += timedelta(days=1)
    return points


def balance_as_of(transactions: list[Transaction], opening: Decimal, as_of: date) -> Decimal:
    """Calculate the closing EUR balance from entries booked and valued by the cutoff."""
    if len({item.account for item in transactions}) > 1:
        raise ValueError("Balances require a single account")
    starting_balance = ForecastPoint(day=as_of, balance=opening).balance
    eligible_amounts = (
        item.amount_eur
        for item in transactions
        if item.booked_on <= as_of and item.value_on <= as_of
    )
    closing_balance = sum(eligible_amounts, starting_balance)
    return ForecastPoint(day=as_of, balance=closing_balance).balance


def build_liquidity_forecast(
    *,
    as_of: date,
    opening_balance: Decimal,
    planned_flows: list[PlannedCashFlow],
    horizon_days: int = 45,
    reserve: Decimal = Decimal("0.00"),
) -> LiquidityForecast:
    """Forecast daily closing balances from tomorrow through the end of the horizon."""
    if not 1 <= horizon_days <= (date.max - as_of).days:
        raise ValueError("Forecast horizon must be positive and fit within the supported dates")
    if not reserve.is_finite() or reserve < 0:
        raise ValueError("Reserve must be finite and nonnegative")

    opening = ForecastPoint(day=as_of, balance=opening_balance)
    end_on = as_of + timedelta(days=horizon_days)
    flows_in_horizon = sorted(
        (flow for flow in planned_flows if as_of < flow.date <= end_on),
        key=lambda flow: flow.date,
    )
    daily_changes: dict[date, Decimal] = defaultdict(lambda: Decimal("0.00"))
    for flow in flows_in_horizon:
        daily_changes[flow.date] += flow.amount_eur

    balance = opening.balance
    points = []
    for offset in range(1, horizon_days + 1):
        day = as_of + timedelta(days=offset)
        balance += daily_changes[day]
        points.append(ForecastPoint(day=day, balance=balance))

    minimum = min(points, key=lambda point: point.balance)
    funding_needed = max(Decimal("0.00"), reserve - min(opening.balance, minimum.balance))
    funding_needed_by = next(
        (point.day for point in (opening, *points) if point.balance < reserve),
        None,
    )
    drivers = []
    if funding_needed and minimum.balance < opening.balance:
        drivers = [
            flow
            for flow in flows_in_horizon
            if flow.date <= minimum.day and flow.amount_eur < 0 and daily_changes[flow.date] < 0
        ]
    return LiquidityForecast(
        as_of=as_of,
        opening_balance=opening.balance,
        reserve=reserve,
        daily_balances=points,
        first_deficit_on=next((point.day for point in points if point.balance < 0), None),
        minimum_balance=minimum.balance,
        minimum_on=minimum.day,
        funding_needed=funding_needed,
        funding_needed_by=funding_needed_by,
        drivers=drivers,
    )


def validate_proposal(
    action: str, amount: Decimal, points: list[ForecastPoint], reserve: Decimal
) -> None:
    """Guardrail for a complete future horizon, including its opening balance."""
    if not points or not reserve.is_finite() or reserve < 0:
        raise ValueError("A forecast and nonnegative reserve are required")
    if not amount.is_finite() or amount < 0:
        raise ValueError("Invalid amount")
    minimum = min(point.balance for point in points)
    if action == "hold" and amount == 0:
        return
    if action == "propose_credit" and minimum < reserve and amount == reserve - minimum:
        return
    if action == "propose_investment" and 0 < amount <= minimum - reserve:
        return
    raise ValueError("Recommendation violates liquidity policy")
