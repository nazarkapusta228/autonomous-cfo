"""Illustrate the cash effect if a simulated application were actually funded."""

from datetime import date
from decimal import Decimal
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field

from cfo.agent_types import AgentRecommendation
from cfo.agents.policy import validate_agent_recommendation
from cfo.models import ForecastPoint, LiquidityForecast, Money


class SettlementTerms(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    settles_on: date
    # Total assumed borrowing cost or deposit interest, paid at settlement (EUR).
    interest_eur: Annotated[Money, Field(ge=0)]


class Comparison(BaseModel):
    baseline: list[ForecastPoint]
    with_action: list[ForecastPoint]
    terms: SettlementTerms
    # Principal still borrowed or invested beyond the plotted horizon.
    outstanding_principal: Money


def compare_scenarios(
    forecast: LiquidityForecast, proposal: AgentRecommendation, terms: SettlementTerms
) -> Comparison:
    """Include both the initial cash movement and the contractual reversal at maturity."""
    if proposal.action == "hold":
        raise ValueError("A hold recommendation has no cash movement to simulate")
    credit = proposal.action == "propose_credit"
    validate_agent_recommendation("liquidity" if credit else "investment", forecast, proposal)
    if terms.settles_on <= proposal.execute_on:
        raise ValueError("Settlement must be later than the assumed funding date")
    if not credit and (
        proposal.available_until is None or terms.settles_on > proposal.available_until
    ):
        raise ValueError("Deposit maturity exceeds the assessed investment window")
    baseline = [
        ForecastPoint(day=forecast.as_of, balance=forecast.opening_balance),
        *forecast.daily_balances,
    ]
    initial = proposal.amount if credit else -proposal.amount
    interest = -terms.interest_eur if credit else terms.interest_eur
    points = []
    for point in baseline:
        adjustment = Decimal(0)
        if point.day >= terms.settles_on:
            adjustment = interest
        elif point.day >= proposal.execute_on:
            adjustment = initial
        points.append(ForecastPoint(day=point.day, balance=point.balance + adjustment))
    return Comparison(
        baseline=baseline,
        with_action=points,
        terms=terms,
        outstanding_principal=proposal.amount
        if terms.settles_on > baseline[-1].day
        else Decimal(0),
    )
