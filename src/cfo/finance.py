from collections import defaultdict
from datetime import date, timedelta
from decimal import Decimal

from cfo.models import ForecastPoint, Transaction


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
