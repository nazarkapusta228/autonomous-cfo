from decimal import Decimal

from cfo.agent_types import AgentRecommendation, ReceiptDelay
from cfo.agents.policy import as_forecast
from cfo.agents.review import review
from cfo.config import Settings
from cfo.models import ForecastPoint, LiquidityForecast


def analyse(
    settings: Settings,
    forecast: LiquidityForecast | list[ForecastPoint],
    reserve: Decimal | None = None,
    *,
    receipt_delays: tuple[ReceiptDelay, ...] = (),
) -> AgentRecommendation:
    return review(settings, "investment", as_forecast(forecast, reserve), receipt_delays)
