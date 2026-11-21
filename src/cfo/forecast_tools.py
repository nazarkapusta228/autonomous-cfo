"""Forecast uncertainty and illustrative revolving-credit cash flows."""

from collections import defaultdict
from datetime import timedelta
from decimal import ROUND_HALF_UP, Decimal
from statistics import stdev


def daily_error_scale(transactions, cutoff):
    """Innovation SD for a driftless ARIMA(0,1,0) balance-error model."""
    if not transactions:
        return None
    start = max(min(t.value_on for t in transactions), cutoff - timedelta(days=365))
    days = (cutoff - start).days + 1
    if days < 56 or max(t.value_on for t in transactions) < cutoff - timedelta(days=28):
        return None
    amounts = defaultdict(float)
    for t in transactions:
        amounts[t.value_on] += float(t.amount_eur)
    daily = [amounts[start + timedelta(days=i)] for i in range(days)]
    scale = stdev(daily[i] - daily[i - 28] for i in range(28, days))
    return scale or None


def credit_path(forecast, proposal, product, annual_rate):
    """Draw to reserve with an overdraft, or draw the full line on the proposal date."""
    balance = forecast.opening_balance
    debt = interest = Decimal(0)
    previous = balance
    points = []
    payoff = first_draw = None
    peak = Decimal(0)
    if proposal.execute_on == forecast.as_of:
        debt = (
            proposal.amount
            if product == "credit_line"
            else min(proposal.amount, max(Decimal(0), forecast.reserve - balance))
        )
        balance += debt
        peak = debt
        if debt:
            first_draw = forecast.as_of
    for point in forecast.daily_balances:
        balance += point.balance - previous
        previous = point.balance
        charge = (debt * annual_rate / Decimal(36500)).quantize(
            Decimal(".01"), rounding=ROUND_HALF_UP
        )
        interest += charge
        balance -= charge
        if point.day >= proposal.execute_on:
            need = max(Decimal(0), forecast.reserve - balance)
            if product == "credit_line" and point.day == proposal.execute_on:
                need = proposal.amount
            draw = min(need, proposal.amount - debt)
            if draw:
                first_draw = first_draw or point.day
                payoff = None
                debt += draw
                balance += draw
                peak = max(peak, debt)
            if not draw and debt and balance > forecast.reserve:
                repayment = min(debt, balance - forecast.reserve)
                balance -= repayment
                debt -= repayment
                if debt == 0:
                    payoff = point.day
        points.append({"day": point.day, "balance": balance})
    return {
        "points": points,
        "interest": interest,
        "outstanding": debt,
        "peak": peak,
        "payoff": payoff,
        "days_to_close": (payoff - first_draw).days if payoff and first_draw else None,
        "minimum_balance": min(p["balance"] for p in points),
    }
