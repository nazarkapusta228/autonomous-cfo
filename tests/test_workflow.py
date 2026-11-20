from concurrent.futures import ThreadPoolExecutor
from datetime import date
from decimal import Decimal
from pathlib import Path
from uuid import uuid4

import psycopg
import pytest

from cfo.agent_types import AgentRecommendation
from cfo.agents import investment, liquidity
from cfo.agents.policy import proposal_fields
from cfo.analysis import prepare_analysis
from cfo.config import Settings
from cfo.service import assess
from cfo.workflow import decide, get_recommendation

DATA = Path(__file__).parents[1] / "data/sample"
STATEMENT = (DATA / "pizzeria-amalfi-2025.csv").read_bytes()
PLAN = (DATA / "pizzeria-amalfi-liquidity-plan.csv").read_bytes()


def demo(opening):
    return prepare_analysis(
        STATEMENT, PLAN, as_of=date(2025, 5, 31), starting_balance=Decimal(opening)
    )


@pytest.fixture
def explained(monkeypatch):
    calls = []

    def analyst(role):
        def run(settings, forecast, **kwargs):
            calls.append(role)
            return AgentRecommendation(
                **proposal_fields(role, forecast),
                explanation="Evaluated scenario",
                risks=["Forecast uncertainty"],
            )

        return run

    monkeypatch.setattr(liquidity, "analyse", analyst("liquidity"))
    monkeypatch.setattr(investment, "analyse", analyst("investment"))
    return calls


def test_approval_is_atomic_and_idempotent_on_concurrent_clicks(postgres_url, explained):
    settings = Settings(_env_file=None, database_url=postgres_url)
    analysis, key = demo("2500"), uuid4()
    item = assess(settings, analysis, "liquidity", request_id=key)
    with ThreadPoolExecutor(max_workers=3) as pool:
        saved = list(
            pool.map(lambda _: decide(postgres_url, item.id, "approve", actor="owner"), range(3))
        )
    assert {r.application_id for r in saved} == {saved[0].application_id}
    assert saved[0].application_id is not None and saved[0].status == "simulated"
    assert [e.event for e in saved[0].audit] == ["assessed", "approved", "simulated"]
    assert saved[0].audit[1].actor == "owner"
    assert get_recommendation(postgres_url, item.id) == saved[0]
    assert assess(settings, analysis, "liquidity", request_id=key) == saved[0]
    with pytest.raises(ValueError, match="different analysis"):
        assess(settings, demo("2600"), "liquidity", request_id=key)
    with pytest.raises(ValueError, match="simulated"):
        decide(postgres_url, item.id, "reject", actor="owner")
    assert explained == ["liquidity"]
    with psycopg.connect(postgres_url) as conn:
        assert conn.execute(
            "SELECT amount_eur, planned_on FROM simulated_applications"
        ).fetchall() == [(Decimal("10843.69"), date(2025, 6, 13))]
        with pytest.raises(psycopg.Error, match="immutable"):
            conn.execute("UPDATE recommendations SET scenario='{}' WHERE id=%s", (item.id,))


def test_rejected_investment_and_hold_never_create_applications(postgres_url, explained):
    settings = Settings(_env_file=None, database_url=postgres_url)
    surplus = assess(settings, demo("30000"), "investment", request_id=uuid4())
    assert surplus.recommendation.action == "propose_investment"
    saved = decide(postgres_url, surplus.id, "reject", actor="owner")
    assert saved.application_id is None and saved.status == "rejected"
    assert decide(postgres_url, surplus.id, "reject", actor="owner") == saved
    with pytest.raises(ValueError, match="rejected"):
        decide(postgres_url, surplus.id, "approve", actor="owner")
    hold = assess(settings, demo("2500"), "investment", request_id=uuid4())
    assert hold.status == "no_action"
    with pytest.raises(ValueError, match="no_action"):
        decide(postgres_url, hold.id, "approve", actor="owner")


def test_failure_rolls_back_approval_and_audit(postgres_url, explained):
    settings = Settings(_env_file=None, database_url=postgres_url)
    item = assess(settings, demo("2500"), "liquidity", request_id=uuid4())
    with psycopg.connect(postgres_url) as conn:
        conn.execute("ALTER TABLE simulated_applications ADD CHECK (amount_eur < 1)")
    with pytest.raises(psycopg.errors.CheckViolation):
        decide(postgres_url, item.id, "approve", actor="owner")
    assert get_recommendation(postgres_url, item.id) == item
