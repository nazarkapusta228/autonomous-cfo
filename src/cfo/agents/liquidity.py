from decimal import Decimal
from itertools import pairwise

from cfo.config import Settings
from cfo.finance import validate_proposal
from cfo.llm import recommend
from cfo.models import ForecastPoint, Recommendation


def analyse(settings: Settings, points: list[ForecastPoint], reserve: Decimal) -> Recommendation:
    if not points or not reserve.is_finite() or reserve < 0:
        raise ValueError("Provide an ordered future forecast and nonnegative reserve")
    if any(a.day >= b.day for a, b in pairwise(points)):
        raise ValueError("Forecast dates must be strictly increasing")
    proposal = recommend(
        settings,
        "liquidity",
        {
            "forecast": [p.model_dump(mode="json") for p in points],
            "reserve_eur": str(reserve),
            "credit_needed_eur": str(max(Decimal(0), reserve - min(p.balance for p in points))),
            "allowed_actions": ["hold", "propose_credit"],
            "execute_on": points[0].day.isoformat(),
        },
    )
    if proposal.action not in {"hold", "propose_credit"}:
        raise ValueError("Unexpected liquidity action")
    if proposal.execute_on != points[0].day:
        raise ValueError("Action date does not match scenario start")
    validate_proposal(proposal.action, proposal.amount, points, reserve)
    return proposal
