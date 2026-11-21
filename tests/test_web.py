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
    assert first["analysis"]["forecast"]["funding_needed"] == "2171.61"
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


def test_retired_workspace_actions_are_unavailable():
    browser = TestClient(app, headers={"X-CFO-Client": "dashboard"})
    for path in ("/api/simulations", "/api/agents/investment"):
        assert browser.post(path, json={}).status_code in {404, 405}


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


def test_data_files_edits_exports_and_deletion(postgres_url, monkeypatch):
    import psycopg

    monkeypatch.setenv("DATABASE_URL", postgres_url)
    owner, guest = client(), client()
    first = state(owner)

    def save(path, **fields):
        return owner.post("/api/" + path, json=dict(revision=state(owner)["revision"], **fields))

    filename = "payments.txt"
    content = (
        "Account Number\tBooking Date\tTransaction Type\tPayment Reference\tAmount\tCurrency\n"
        "123\t2025-05-01\trent\tOffice\t-100.99\tEUR\n"
        "123\t2025-05-02\trent\tOffice\t-101.00\tEUR"
    )
    preview = save("data/statement/preview", filename=filename, content=content).json()
    upload = dict(filename=filename, content=content, mapping=preview["mapping"])
    assert (
        guest.post(
            "/api/data/statement/import", json=dict(revision=first["revision"], **upload)
        ).status_code
        == 409
    )
    assert save("data/statement/import", **upload).is_success
    assert state(owner)["statement_info"]["total"] == 2
    assert save(
        "payments/edit", source_row=2, column="Amount", value="-20", same_type=True
    ).is_success
    assert save(
        "payments/edit", source_row=2, column="category", value="Office rent", same_type=True
    ).is_success
    assert save(
        "payments/edit", source_row=2, column="Transaction Type", value="supplies"
    ).is_success
    assert save(
        "payments/edit",
        source_row=2,
        column="Payment Reference",
        value="Office expenses",
        same_category=True,
    ).is_success
    assert {r["reference"] for r in state(owner)["statement_rows"]} == {"Office expenses"}
    updated = state(owner)
    assert {record["category"] for record in updated["statement_rows"]} == {"Office rent"}
    original = owner.get("/api/data/statement/original", params={"revision": updated["revision"]})
    assert original.content.decode() == content
    assert updated["history"][-1]["balance"] == "2460.00"
    assert updated["analysis"]["forecast"]["opening_balance"] == "2460.00"
    for fmt in ("csv", "txt", "json", "pdf"):
        response = owner.get(
            "/api/data/statement/export", params=dict(format=fmt, revision=updated["revision"])
        )
        assert response.is_success
        if fmt == "pdf":
            assert response.content.startswith(b"%PDF")
        else:
            assert "-20,00" in response.text and "Office rent" in response.text
    assert save("data/statement/remove").is_success
    assert state(owner)["history"] == []
    assert state(guest)["statement_info"]["total"] > 2
    assert save("data/statement/import", **upload).is_success
    plan_json = '[{"date":"2025-06-02","category":"rent","amount_eur":-250,"description":"Office"}]'
    preview = save("data/plan/preview", filename="plan.json", content=plan_json).json()
    assert save(
        "data/plan/import", filename="plan.json", content=plan_json, mapping=preview["mapping"]
    ).is_success
    flows = state(owner)["analysis"]["plan"]
    assert [f["amount_eur"] for f in flows if f["description"] == "Office"] == ["-250.00"]
    with psycopg.connect(postgres_url) as conn:
        scope = conn.execute("SELECT workspace_id FROM web_data_files LIMIT 1").fetchone()[0]
    assert owner.post("/api/account/delete", json={"password": "test-only-password"}).is_success
    with psycopg.connect(postgres_url) as conn:
        assert conn.execute("SELECT count(*) FROM web_data_files").fetchone()[0] == 0
        assert (
            conn.execute(
                "SELECT count(*) FROM statement_imports WHERE scope=%s", (str(scope),)
            ).fetchone()[0]
            == 0
        )


def test_planned_payment_edit_preserves_bookings_and_checks_revision(postgres_url, monkeypatch):
    monkeypatch.setenv("DATABASE_URL", postgres_url)
    owner = client()
    before = state(owner)
    first = before["analysis"]["plan"][0]
    payload = {
        **first,
        "revision": before["revision"],
        "key": before["plan_keys"][0],
        "amount_eur": "-123.45",
        "description": "Revised budget",
    }
    payload.pop("invoice_id", None)
    saved = owner.post("/api/plan/edit", json=payload)
    assert saved.is_success, saved.text
    after = state(owner)
    revised = after["analysis"]["plan"][after["plan_keys"].index(payload["key"])]
    assert revised["description"] == "Revised budget" and revised["amount_eur"] == "-123.45"
    assert before["history"] == after["history"]
    assert before["analysis"]["forecast"] != after["analysis"]["forecast"]
    assert owner.post("/api/plan/edit", json=payload).status_code == 409
