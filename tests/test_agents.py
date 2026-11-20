from datetime import date
from decimal import Decimal

import pytest

from cfo.agents import investment, liquidity
from cfo.config import Settings
from cfo.models import ForecastPoint, Recommendation


@pytest.mark.parametrize(
    "module,action,amount",
    [
        (liquidity, "propose_investment", "100"),
        (investment, "propose_credit", "100"),
        (investment, "propose_investment", "20000"),
    ],
)
def test_agent_rejects_unsafe_model_output(monkeypatch, module, action, amount):
    proposal = Recommendation(
        action=action,
        amount=amount,
        execute_on=date(2025, 6, 1),
        explanation="Example",
        risks=["Scenario uncertainty"],
    )
    monkeypatch.setattr(module, "recommend", lambda *args: proposal)
    with pytest.raises(ValueError):
        module.analyse(
            Settings(_env_file=None),
            [ForecastPoint(day=date(2025, 6, 1), balance="10000")],
            Decimal("5000"),
        )


def test_liquidity_accepts_validated_credit(monkeypatch):
    proposal = Recommendation(
        action="propose_credit",
        amount="6000",
        execute_on=date(2025, 6, 1),
        explanation="Reserve shortfall",
        risks=["Credit terms still require review"],
    )
    monkeypatch.setattr(liquidity, "recommend", lambda *args: proposal)
    assert (
        liquidity.analyse(
            Settings(_env_file=None),
            [ForecastPoint(day=date(2025, 6, 1), balance="-1000")],
            Decimal("5000"),
        )
        == proposal
    )
