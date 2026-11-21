from datetime import timedelta

import psycopg
from fastapi.testclient import TestClient

from cfo.web import app


def test_account_lifecycle(postgres_url, monkeypatch):
    monkeypatch.setenv("DATABASE_URL", postgres_url)
    messages = []
    monkeypatch.setattr("cfo.accounts.send_code", lambda *args: messages.append(args))
    browser = TestClient(app, headers={"X-CFO-Client": "dashboard"})

    def post(path, **body):
        return browser.post("/api/account/" + path, json=body)

    password = "first-test-password"
    email = "owner@example.test"

    def verify(purpose, secret):
        return post("confirm", purpose=purpose, code=messages[-1][2], password=secret)

    assert browser.get("/api/workspace").status_code == 401
    assert post(
        "signup", first_name="Anna", last_name="Nowak", email=email, password=password
    ).is_success
    assert post("login", email=email, password=password).status_code == 401
    assert verify("activate", password).is_success
    assert verify("activate", password).status_code == 400
    login = post("login", email=email, password=password)
    assert login.is_success
    assert "Max-Age=604800" in login.headers["set-cookie"]
    with psycopg.connect(postgres_url) as conn:
        assert conn.execute("SELECT expires_at-issued_at FROM cfo_sessions").fetchone() == (
            timedelta(days=7),
        )
    first = browser.get("/api/workspace").json()
    assert len(first["statement_rows"]) == 1125
    assert post("names", first_name="Jan", last_name="Kowal").json()["first_name"] == "Jan"
    new_email = "new@example.test"
    assert post("change-email", email=new_email, password=password).is_success
    assert browser.get("/api/account/me").json()["email"] == email
    assert verify("email", password).is_success
    assert post("forgot", email=new_email).is_success
    new_password = "second-test-password"
    assert verify("reset", new_password).is_success
    assert browser.get("/api/workspace").status_code == 401
    assert post("login", email=new_email, password=password).status_code == 401
    assert post("login", email=new_email, password=new_password).is_success
    assert browser.get("/api/workspace").json()["revision"] == first["revision"]
    assert post("logout").is_success
    assert post("login", email=new_email, password=new_password).is_success
    final_password = "final-test-password"
    assert post("password", password=new_password, new_password=final_password).is_success
    assert browser.get("/api/account/me").status_code == 401
    assert post("login", email=new_email, password=final_password).is_success
    assert post("delete", password=password).status_code == 400
    assert post("delete", password=final_password).is_success
    assert browser.get("/api/account/me").status_code == 401
    assert post("login", email=new_email, password=new_password).status_code == 401

    with psycopg.connect(postgres_url) as conn:
        for table in (
            "cfo_users",
            "cfo_sessions",
            "cfo_mail_codes",
            "web_workspaces",
            "web_revisions",
            "statement_imports",
            "transactions",
        ):
            assert conn.execute(f"SELECT count(*) FROM {table}").fetchone() == (0,)
