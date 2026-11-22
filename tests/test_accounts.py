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
        code = messages[-1][2]
        assert len(code) == 6 and code.isascii() and code.isdigit()
        return post("confirm", email=email, purpose=purpose, code=code, password=secret)

    assert browser.get("/api/workspace").status_code == 401
    assert post(
        "signup", first_name="Anna", last_name="Nowak", email=email, password=password
    ).is_success
    assert post("login", email=email, password=password).status_code == 401
    wrong_code = f"{(int(messages[-1][2]) + 1) % 1000000:06d}"
    assert (
        post(
            "confirm", email=email, purpose="activate", code=wrong_code, password=password
        ).status_code
        == 400
    )
    assert browser.get("/api/account/me").status_code == 401
    activation = verify("activate", password)
    assert activation.is_success
    assert browser.get("/api/account/me").json() == activation.json()["user"]
    assert browser.get("/api/workspace").is_success
    assert verify("activate", password).status_code == 400
    assert "Max-Age=604800" in activation.headers["set-cookie"]
    with psycopg.connect(postgres_url) as conn:
        assert conn.execute("SELECT expires_at-issued_at FROM cfo_sessions").fetchone() == (
            timedelta(days=7),
        )
    first = browser.get("/api/workspace").json()
    assert first["statement_rows"] == first["history"] == first["analysis"]["plan"] == []
    assert all(not file["present"] for file in first["data_files"].values())
    assert first["analysis"]["forecast"]["opening_balance"] == "0.00"
    assert post("names", first_name="Jan", last_name="Kowal").json()["first_name"] == "Jan"
    new_email = "new@example.test"
    assert post("change-email", email=new_email, password=password).is_success
    assert browser.get("/api/account/me").json()["email"] == email
    assert verify("email", password).is_success
    assert post("forgot", email=new_email).is_success
    new_password = "second-test-password"
    code = messages[-1][2]
    assert post("reset-code", email=email, code=code).status_code == 400
    verified = post("reset-code", email=new_email, code=code)
    assert verified.is_success
    assert post("reset-code", email=new_email, code=code).status_code == 400
    token = verified.json()["token"]
    assert post("reset-password", token=token, password=new_password).is_success
    assert post("reset-password", token=token, password=password).status_code == 400
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
