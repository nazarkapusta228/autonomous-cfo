"""HTTP contracts for the React workspace and its PostgreSQL boundaries."""

from unittest.mock import patch
from uuid import uuid4

from fastapi.testclient import TestClient

from cfo.web import app


def client():
    browser = TestClient(app, headers={"X-CFO-Client": "dashboard"})
    credentials = {"email": f"{uuid4()}@example.test", "password": "test-only-password"}
    with patch("cfo.accounts.send_code") as mail:
        assert browser.post(
            "/api/account/signup", json=dict(credentials, first_name="A", last_name="B")
        ).is_success
    code = mail.call_args.args[-1]
    assert browser.post(
        "/api/account/confirm",
        json=dict(purpose="activate", code=code, **credentials),
    ).is_success
    assert browser.post("/api/account/login", json=credentials).is_success
    return browser


def state(browser):
    response = browser.get("/api/workspace")
    assert response.status_code == 200, response.text
    return response.json()


def test_workspace_isolation_uploads_and_stale_edits(postgres_url, monkeypatch):
    monkeypatch.setenv("DATABASE_URL", postgres_url)
    owner, guest = client(), client()
    first, other = state(owner), state(guest)
    assert first["revision"] != other["revision"]
    assert first["analysis"]["forecast"]["funding_needed"] == "0.00"
    item = first["transactions"][0]
    edit = dict(
        revision=first["revision"],
        source_row=item["source_row"],
        category="Review supplies",
        future=True,
    )
    assert guest.post("/api/categories", json=edit).status_code == 409
    assert owner.post("/api/categories", json=edit).is_success
    assert state(owner)["transactions"][0]["category"] == "Review supplies"
    assert state(guest)["transactions"][0]["category"] == item["category"]
    payload = dict(revision=first["revision"], settings=first["settings"], plan="bad header")
    assert owner.post("/api/forecast", json=payload).status_code == 422
    assert state(owner)["revision"] == first["revision"]
    payload["plan"] = "date,category,amount_eur,description\n2025-06-01,rent,-100,Rent"
    payload["invoices"] = (
        "invoice_id;counterparty;issued_on;due_on;amount_eur\n"
        f"INV-X;Supplier;{item['value_on']};{item['value_on']};"
        f"{item['amount_eur']}"
    )
    assert owner.post("/api/forecast", json=payload).is_success
    second = state(owner)
    assert owner.post("/api/categories", json=edit).status_code == 409
    assert item["source_row"] in second["analysis"]["reconciliation"]["ambiguous"]["INV-X"]
    assert (
        owner.post("/api/agents/liquidity", json={"revision": second["revision"]}).status_code
        == 422
    )
    assert owner.post(
        "/api/invoice-matches",
        json=dict(revision=second["revision"], invoice_id="INV-X", source_row=item["source_row"]),
    ).is_success
    third = state(owner)
    assert third["analysis"]["reconciliation"]["settled"] == {"INV-X": item["source_row"]}
    assert third["revision"] != second["revision"]
    assert state(guest)["has_invoices"] is False


def test_simulations_are_persistent_and_idempotent(postgres_url, monkeypatch):
    monkeypatch.setenv("DATABASE_URL", postgres_url)
    browser = client()
    revision = state(browser)["revision"]
    fx = dict(
        revision=revision,
        kind="fx_forward",
        amount="100",
        effective_on="2025-06-10",
        eur_per_chf="1.0425",
    )
    first = browser.post("/api/simulations", json=fx)
    assert first.is_success
    again = browser.post("/api/simulations", json={**fx, "amount": "100.00"})
    assert again.json() == first.json()
    snapshot = state(browser)
    assert snapshot["simulations"][0]["basis"]["estimated_eur"] == "104.25"
    assert len(snapshot["audit"]) == 1
    assert browser.post("/api/simulations", json={**fx, "eur_per_chf": None}).status_code == 422
    browser.headers.pop("X-CFO-Client")
    assert browser.post("/api/simulations", json=fx).status_code == 403


def test_agent_decision_and_comparison_routes(postgres_url, monkeypatch):
    from cfo.agent_types import AgentRecommendation
    from cfo.agents import liquidity
    from cfo.agents.policy import proposal_fields

    monkeypatch.setenv("DATABASE_URL", postgres_url)
    monkeypatch.setattr(
        liquidity,
        "analyse",
        lambda settings, forecast, **kw: AgentRecommendation(
            **proposal_fields("liquidity", forecast), explanation="Test review", risks=["Cash risk"]
        ),
    )
    browser = client()
    initial = state(browser)
    assert browser.post(
        "/api/forecast",
        json=dict(
            revision=initial["revision"], settings=dict(initial["settings"], starting_balance="0")
        ),
    ).is_success
    payload = {"revision": state(browser)["revision"]}
    response = browser.post("/api/agents/liquidity", json=payload)
    assert response.is_success, response.text
    assert browser.post("/api/agents/liquidity", json=payload).json() == response.json()
    terms = {"settles_on": "2025-07-01", "interest_eur": "10"}
    compare = browser.post("/api/agents/liquidity/comparison", json={**payload, "terms": terms})
    assert compare.is_success
    assert len(compare.json()["with_action"]) == 46
    assert browser.post("/api/agents/liquidity/decision/approve", json=payload).is_success
    assert state(browser)["assessments"]["liquidity"]["status"] == "simulated"
    assert browser.post("/api/agents/liquidity/decision/reject", json=payload).status_code == 422
