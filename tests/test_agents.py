import json
from datetime import date, timedelta
from decimal import Decimal

import httpx
import pytest

from cfo.agent_types import ReceiptDelay
from cfo.agents import investment, liquidity
from cfo.config import Settings
from cfo.finance import build_liquidity_forecast
from cfo.llm import ModelError
from cfo.models import PlannedCashFlow

START = date(2025, 5, 31)
SETTINGS = Settings(
    _env_file=None,
    llm_base_url="https://rhoai.test/v1",
    llm_api_key="fixture",
    llm_model="Qwen/Qwen2.5-7B-Instruct",
)


def forecast(opening="10000", changes=(), reserve="1000"):
    return build_liquidity_forecast(
        as_of=START,
        opening_balance=Decimal(opening),
        reserve=Decimal(reserve),
        horizon_days=45,
        planned_flows=[
            PlannedCashFlow(
                date=START + timedelta(days=day),
                amount_eur=amount,
                category="payroll",
                description="private bank reference",
            )
            for day, amount in changes
        ],
    )


def endpoint(monkeypatch, *, change=None, status=200, envelope=None):
    actual_client = httpx.Client
    seen = []

    def server(request):
        body = json.loads(request.content)
        assert request.url.path == "/v1/chat/completions"
        assert request.headers["Authorization"] == "Bearer fixture"
        assert body["model"] == "Qwen/Qwen2.5-7B-Instruct"
        assert body["response_format"]["type"] == "json_schema"
        assert "private bank reference" not in body["messages"][1]["content"]
        ctx = json.loads(body["messages"][1]["content"])
        allowed = body["response_format"]["json_schema"]["schema"]["properties"]
        if not ctx["evidence"]:
            assert allowed["evidence_ids"]["maxItems"] == 0
        assert allowed["action"]["enum"] == [ctx["proposal"]["action"]]
        seen.append(ctx)
        result = {
            **ctx["proposal"],
            "evidence_ids": [0] if ctx["evidence"] else [],
            "risk_ids": ["receipts"],
            "next_step": next(iter(ctx["next_steps"])),
        }
        if change:
            result.update(change)
        return httpx.Response(
            status,
            json=envelope
            if envelope is not None
            else {
                "choices": [{"finish_reason": "stop", "message": {"content": json.dumps(result)}}]
            },
        )

    monkeypatch.setattr(
        httpx, "Client", lambda **kw: actual_client(transport=httpx.MockTransport(server), **kw)
    )
    return seen


def test_liquidity_distinguishes_reserve_deadline_and_negative_balance(monkeypatch):
    ctx = endpoint(monkeypatch)
    plan = forecast(changes=[(2, "-9500"), (3, "-3000")])
    rec = liquidity.analyse(SETTINGS, plan)
    assert rec.product == "credit_line"
    assert rec.amount == Decimal("3500")
    assert rec.execute_on == date(2025, 6, 2)
    assert "First negative balance on 2025-06-03" in rec.explanation
    assert "2025-06-02: payroll outflow of EUR 9500.00" in rec.explanation
    assert ctx[0]["as_of"] == "2025-05-31"


@pytest.mark.parametrize(
    "change",
    [
        {"action": "hold", "amount": "0"},
        {"amount": "9999"},
        {"execute_on": "2025-05-31"},
        {"evidence_ids": [9]},
        {"risk_ids": []},
        {"next_step": "offer guaranteed financing"},
        {"risk_ids": ["unknown risk"]},
        {"extra": "unexpected financial term"},
    ],
)
def test_invalid_model_answers_cannot_be_used(monkeypatch, change):
    endpoint(monkeypatch, change=change)
    with pytest.raises(ModelError) as failure:
        liquidity.analyse(SETTINGS, forecast(changes=[(4, "-12000")]))
    assert failure.value.retryable


def test_opening_shortfall_requires_credit_even_if_tomorrow_recovers(monkeypatch):
    endpoint(monkeypatch)
    rec = liquidity.analyse(SETTINGS, forecast("-100", [(1, "10000")]))
    assert (rec.amount, rec.execute_on) == (Decimal("1100"), START)


def test_investment_reserves_cash_through_entire_horizon(monkeypatch):
    endpoint(monkeypatch)
    rec = investment.analyse(SETTINGS, forecast(changes=[(3, "-4300"), (4, "15000")]))
    assert (rec.operating_cash, rec.reserve_cash, rec.free_cash) == (4300, 1000, 4700)
    assert rec.amount == 4700 and rec.product == "term_deposit"
    assert rec.available_until == START + timedelta(days=45)
    assert rec.execute_on == START


def test_investment_with_upcoming_shortfall_and_liquidity_without_gap_hold(monkeypatch):
    endpoint(monkeypatch)
    inv = investment.analyse(SETTINGS, forecast(changes=[(2, "-10500")]))
    assert inv.action == "hold" and inv.amount == 0 and inv.free_cash == 0
    liq = liquidity.analyse(SETTINGS, forecast())
    assert liq.action == "hold" and liq.amount == 0


@pytest.mark.parametrize(
    "status,envelope,retry",
    [
        (401, {}, False),
        (400, {}, False),
        (503, {}, True),
        (200, {}, True),
        (200, {"choices": [{"finish_reason": "length"}]}, True),
    ],
)
def test_model_failures_have_displayable_status(monkeypatch, status, envelope, retry):
    endpoint(monkeypatch, status=status, envelope=envelope)
    with pytest.raises(ModelError) as failure:
        investment.analyse(SETTINGS, forecast())
    assert failure.value.retryable == retry
    assert "fixture" not in str(failure.value)


def test_late_customer_evidence_only_identifies_owner_locally(monkeypatch):
    contexts = endpoint(monkeypatch, change={"evidence_ids": [1]})
    plan = forecast(changes=[(2, "-12000")])
    receipt = ReceiptDelay(
        invoice_id="INV-PRIVATE",
        counterparty="Local Customer",
        due_on=START,
        expected_on=START + timedelta(days=5),
        amount_eur="500",
        payments=5,
        late_payments=3,
    )
    rec = liquidity.analyse(SETTINGS, plan, receipt_delays=(receipt,))
    assert "Local Customer, invoice INV-PRIVATE" in rec.explanation
    assert "Customer paid late 3/5" in rec.explanation
    assert "INV-PRIVATE" not in json.dumps(contexts)
    assert "Local Customer" not in json.dumps(contexts)
