from datetime import timedelta
from decimal import Decimal
from itertools import pairwise

from cfo.agent_types import AgentRecommendation, Role
from cfo.models import ForecastPoint, LiquidityForecast

ZERO = Decimal("0.00")


def as_forecast(
    forecast: LiquidityForecast | list[ForecastPoint], reserve: Decimal | None
) -> LiquidityForecast:
    if isinstance(forecast, LiquidityForecast):
        if reserve is not None and reserve != forecast.reserve:
            raise ValueError("Reserve conflicts with forecast")
        result = forecast
    else:
        # Original points API includes the opening balance as the first point.
        if not forecast or reserve is None:
            raise ValueError("Provide a forecast or balance points with a reserve")
        opening, *future = forecast
        if any(b.day <= a.day for a, b in pairwise(forecast)):
            raise ValueError("Dates must be strictly increasing")
        minimum = min(future or [opening], key=lambda p: p.balance)
        breach = next((p.day for p in forecast if p.balance < reserve), None)
        result = LiquidityForecast(
            as_of=opening.day,
            opening_balance=opening.balance,
            reserve=reserve,
            daily_balances=future,
            first_deficit_on=next((p.day for p in future if p.balance < 0), None),
            minimum_balance=minimum.balance,
            minimum_on=minimum.day,
            funding_needed=max(ZERO, reserve - min(minimum.balance, opening.balance)),
            funding_needed_by=breach,
            drivers=[],
        )
    return result


def proposal_fields(role: Role, f: LiquidityForecast) -> dict:
    if role not in ("liquidity", "investment"):
        raise ValueError("Unknown agent")
    points = [ForecastPoint(day=f.as_of, balance=f.opening_balance), *f.daily_balances]
    if any(b.day <= a.day for a, b in pairwise(points)):
        raise ValueError("Dates must be strictly increasing")
    floor = min(p.balance for p in points)
    gap = max(ZERO, f.reserve - floor)
    deadline = next((p.day for p in points if p.balance < f.reserve), None)
    if (gap, deadline) != (f.funding_needed, f.funding_needed_by):
        raise ValueError("Funding summary conflicts with forecast balances")
    first_negative = next((p.day for p in f.daily_balances if p.balance < 0), None)
    if first_negative != f.first_deficit_on:
        raise ValueError("Deficit date conflicts with forecast balances")
    minimum = min(f.daily_balances or points, key=lambda p: p.balance)
    if (minimum.balance, minimum.day) != (f.minimum_balance, f.minimum_on):
        raise ValueError("Minimum conflicts with forecast balances")
    result = dict(
        action="hold",
        amount=ZERO,
        execute_on=f.as_of,
        product=None,
        available_until=None,
        operating_cash=None,
        reserve_cash=None,
        free_cash=None,
    )
    if role == "liquidity":
        if gap:
            result.update(
                action="propose_credit", amount=gap, execute_on=deadline, product="credit_line"
            )
        return result
    cash = max(ZERO, f.opening_balance)
    operating = min(cash, f.opening_balance - floor)
    reserve_cash = min(f.reserve, cash - operating)
    free = cash - operating - reserve_cash
    result.update(operating_cash=operating, reserve_cash=reserve_cash, free_cash=free)
    # Do not propose a lockup outside the period covered by contiguous daily balances.
    if (
        free > 0
        and len(points) > 1
        and all(b.day - a.day == timedelta(days=1) for a, b in pairwise(points))
    ):
        result.update(
            action="propose_investment",
            amount=free,
            product="term_deposit",
            available_until=points[-1].day,
        )
    return result


def validate_agent_recommendation(
    role: Role, forecast: LiquidityForecast, recommendation: AgentRecommendation
) -> None:
    fields = proposal_fields(role, forecast)
    if any(getattr(recommendation, name) != value for name, value in fields.items()):
        raise ValueError("Recommendation conflicts with the calculated agent policy")
