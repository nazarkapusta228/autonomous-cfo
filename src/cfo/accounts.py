"""Account sessions, one-time email verification and account-owned workspaces."""

import hashlib
import hmac
import os
import secrets
import smtplib
import ssl
from email.message import EmailMessage
from typing import Annotated, Literal
from uuid import uuid4

import psycopg
from fastapi import APIRouter, HTTPException, Request, Response
from pydantic import BaseModel, Field, SecretStr, StringConstraints

from cfo import workspace as ws
from cfo.config import Settings
from cfo.service import database_dsn

router = APIRouter(prefix="/api/account")
COOKIE = "cfo_session"
SESSION_SECONDS = 7 * 24 * 60 * 60
Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)]
Email = Annotated[
    str,
    StringConstraints(
        strip_whitespace=True,
        to_lower=True,
        max_length=254,
        pattern=r"^[^\s@<>;,]+@[^\s@<>;,]+\.[^\s@<>;,]+$",
    ),
]
Password = Annotated[SecretStr, Field(min_length=10, max_length=256)]


class Address(BaseModel):
    email: Email


class Credentials(Address):
    password: Password


class Names(BaseModel):
    first_name: Name
    last_name: Name


class Registration(Credentials, Names):
    pass


class PasswordCheck(BaseModel):
    password: Password


class PasswordChange(PasswordCheck):
    new_password: Password


class Confirmation(PasswordCheck):
    code: str = Field(min_length=12, max_length=64)
    purpose: Literal["activate", "reset", "email"]


def connection():
    return ws.connection(database_dsn(Settings()))


def digest(value):
    return hashlib.sha256(value.encode()).hexdigest()


def hashed(password, salt=None):
    salt = salt or secrets.token_hex(16)
    value = hashlib.scrypt(
        password.get_secret_value().encode(),
        salt=bytes.fromhex(salt),
        n=32768,
        r=8,
        p=1,
        maxmem=64 * 1024 * 1024,
    )
    return salt + ":" + value.hex()


def matches(password, stored):
    return hmac.compare_digest(hashed(password, stored.split(":")[0]), stored)


def limit(key, maximum):
    with connection() as conn:
        conn.execute("DELETE FROM cfo_auth_limits WHERE started_at < now()-interval '10 minutes'")
        found = conn.execute(
            "INSERT INTO cfo_auth_limits VALUES (%s,now(),1) ON CONFLICT(bucket) "
            "DO UPDATE SET attempts=cfo_auth_limits.attempts+1 RETURNING attempts",
            (digest(key),),
        ).fetchone()
    if found["attempts"] > maximum:
        raise HTTPException(429, "Too many attempts. Try again in ten minutes.")


def send_code(email, purpose, code):
    cfg = Settings()
    if not cfg.smtp_from or not cfg.smtp_host:
        raise HTTPException(503, "Email delivery is unavailable")
    message = EmailMessage()
    action = {
        "activate": "Verify your email",
        "email": "Confirm your new email",
        "reset": "Reset your password",
    }[purpose]
    message["From"], message["To"] = cfg.smtp_from, email
    message["Subject"] = f"Autonomous CFO · {action}"
    message.set_content(
        f"{action}\n\nEnter this code in Autonomous CFO within 20 minutes:\n\n{code}\n\n"
        "If you did not request this, ignore this email."
    )
    try:
        if cfg.smtp_tls == "implicit":
            transport = smtplib.SMTP_SSL(
                cfg.smtp_host, cfg.smtp_port, context=ssl.create_default_context(), timeout=10
            )
        elif cfg.smtp_tls in ("starttls", "plain") and not (
            cfg.smtp_tls == "plain" and cfg.smtp_username
        ):
            transport = smtplib.SMTP(cfg.smtp_host, cfg.smtp_port, timeout=10)
        else:
            raise HTTPException(503, "Invalid mail transport configuration")
        with transport as smtp:
            if cfg.smtp_tls == "starttls":
                smtp.starttls(context=ssl.create_default_context())
            if cfg.smtp_username:
                smtp.login(cfg.smtp_username, cfg.smtp_password.get_secret_value())
            smtp.send_message(message)
    except (OSError, smtplib.SMTPException) as exc:
        raise HTTPException(503, "Email delivery is unavailable") from exc


def issue(conn, user_id, purpose, destination):
    code = secrets.token_hex(10).upper()
    conn.execute(
        "INSERT INTO cfo_mail_codes VALUES (%s,%s,%s,%s,now()+interval '20 minutes') "
        "ON CONFLICT(user_id,purpose) DO UPDATE SET digest=excluded.digest, "
        "destination=excluded.destination, expires_at=excluded.expires_at",
        (digest(code), user_id, purpose, destination),
    )
    send_code(destination, purpose, code)


def current_user(conn, request, lock="FOR SHARE OF u"):
    user = conn.execute(
        "SELECT u.* FROM cfo_sessions s JOIN cfo_users u ON u.id=s.user_id "
        "WHERE s.digest=%s AND s.expires_at>now() AND u.verified " + lock,
        (digest(request.cookies.get(COOKIE, "")),),
    ).fetchone()
    if not user:
        raise HTTPException(401, "Please sign in")
    return user


def public(user):
    return {k: user[k] for k in ("first_name", "last_name", "email")}


@router.get("/me")
def me(request: Request):
    with connection() as conn:
        return public(current_user(conn, request))


@router.post("/signup")
def signup(body: Registration, request: Request):
    limit("signup:" + request.client.host, 60)
    limit("mail:" + body.email, 5)
    with connection() as conn:
        user = conn.execute(
            "INSERT INTO cfo_users(id,email,first_name,last_name,password_hash) "
            "VALUES(%s,%s,%s,%s,%s) "
            "ON CONFLICT(email) DO UPDATE SET first_name=excluded.first_name,"
            "last_name=excluded.last_name,"
            "password_hash=excluded.password_hash WHERE NOT cfo_users.verified RETURNING id",
            (uuid4(), body.email, body.first_name, body.last_name, hashed(body.password)),
        ).fetchone()
        if user:
            issue(conn, user["id"], "activate", body.email)
    return {"ok": True}


@router.post("/login")
def login(body: Credentials, response: Response):
    limit("login:" + body.email, 30)
    with connection() as conn:
        user = conn.execute(
            "SELECT * FROM cfo_users WHERE email=%s FOR UPDATE", (body.email,)
        ).fetchone()
        stored = user["password_hash"] if user else "0" * 32 + ":" + "0" * 128
        if not matches(body.password, stored) or not user or not user["verified"]:
            raise HTTPException(401, "Incorrect credentials or unverified email")
        token = secrets.token_urlsafe(32)
        conn.execute("DELETE FROM cfo_sessions WHERE expires_at<=now()")
        conn.execute(
            "INSERT INTO cfo_sessions (digest,user_id,expires_at) "
            "VALUES (%s,%s,now()+%s * interval '1 second')",
            (digest(token), user["id"], SESSION_SECONDS),
        )
        response.set_cookie(
            COOKIE,
            token,
            httponly=True,
            samesite="strict",
            secure=os.getenv("CFO_SECURE_COOKIE") == "1",
            max_age=SESSION_SECONDS,
        )
        return public(user)


@router.post("/forgot")
def forgot(body: Address, request: Request):
    limit("forgot:" + request.client.host, 60)
    limit("mail:" + body.email, 5)
    with connection() as conn:
        user = conn.execute(
            "SELECT id FROM cfo_users WHERE email=%s AND verified FOR UPDATE", (body.email,)
        ).fetchone()
        if user:
            issue(conn, user["id"], "reset", body.email)
    return {"ok": True}


@router.post("/names")
def names(request: Request, body: Names):
    with connection() as conn:
        user = current_user(conn, request, "FOR UPDATE OF u")
        return public(
            conn.execute(
                "UPDATE cfo_users SET first_name=%s,last_name=%s WHERE id=%s RETURNING *",
                (body.first_name, body.last_name, user["id"]),
            ).fetchone()
        )


@router.post("/change-email")
def change_email(request: Request, body: Credentials):
    with connection() as conn:
        user = current_user(conn, request, "FOR UPDATE OF u")
        limit("login:" + user["email"], 30)
        if not matches(body.password, user["password_hash"]):
            raise HTTPException(400, "Incorrect password")
        limit("mail:" + body.email, 5)
        if conn.execute("SELECT 1 FROM cfo_users WHERE email=%s", (body.email,)).fetchone():
            raise HTTPException(409, "Email address is unavailable")
        issue(conn, user["id"], "email", body.email)
    return {"ok": True}


@router.post("/confirm")
def confirm(request: Request, body: Confirmation):
    with connection() as conn:
        key = digest(body.code.strip().upper())
        row = conn.execute(
            "SELECT u.*,c.destination FROM cfo_users u JOIN cfo_mail_codes c "
            "ON c.user_id=u.id WHERE c.digest=%s AND c.purpose=%s AND c.expires_at>now() "
            "FOR UPDATE OF u,c",
            (key, body.purpose),
        ).fetchone()
        if not row:
            raise HTTPException(400, "Invalid or expired code")
        if body.purpose != "reset" and not matches(body.password, row["password_hash"]):
            raise HTTPException(400, "Incorrect password")
        if body.purpose == "activate":
            workspace = ws.create_workspace(conn, database_dsn(Settings()))
            conn.execute(
                "UPDATE cfo_users SET verified=true,workspace_id=%s WHERE id=%s",
                (workspace, row["id"]),
            )
        elif body.purpose == "email":
            if current_user(conn, request)["id"] != row["id"]:
                raise HTTPException(403, "Sign in to the account requesting this change")
            try:
                conn.execute(
                    "UPDATE cfo_users SET email=%s WHERE id=%s", (row["destination"], row["id"])
                )
            except psycopg.errors.UniqueViolation as exc:
                raise HTTPException(409, "Email address is unavailable") from exc
            conn.execute("DELETE FROM cfo_mail_codes WHERE user_id=%s", (row["id"],))
        else:
            conn.execute(
                "UPDATE cfo_users SET password_hash=%s WHERE id=%s",
                (hashed(body.password), row["id"]),
            )
            conn.execute("DELETE FROM cfo_sessions WHERE user_id=%s", (row["id"],))
            conn.execute("DELETE FROM cfo_mail_codes WHERE user_id=%s", (row["id"],))
        conn.execute("DELETE FROM cfo_mail_codes WHERE digest=%s", (key,))
    return {"ok": True}


@router.post("/password")
def change_password(request: Request, response: Response, body: PasswordChange):
    with connection() as conn:
        user = current_user(conn, request, "FOR UPDATE OF u")
        limit("login:" + user["email"], 30)
        if not matches(body.password, user["password_hash"]):
            raise HTTPException(400, "Incorrect password")
        conn.execute(
            "UPDATE cfo_users SET password_hash=%s WHERE id=%s",
            (hashed(body.new_password), user["id"]),
        )
        conn.execute("DELETE FROM cfo_sessions WHERE user_id=%s", (user["id"],))
        conn.execute("DELETE FROM cfo_mail_codes WHERE user_id=%s", (user["id"],))
    response.delete_cookie(COOKIE)
    return {"ok": True}


@router.post("/logout")
def logout(request: Request, response: Response):
    with connection() as conn:
        conn.execute(
            "DELETE FROM cfo_sessions WHERE digest=%s", (digest(request.cookies.get(COOKIE, "")),)
        )
    response.delete_cookie(COOKIE)
    return {"ok": True}


@router.post("/delete")
def delete(request: Request, response: Response, body: PasswordCheck):
    with connection() as conn:
        user = current_user(conn, request, "FOR UPDATE OF u")
        limit("login:" + user["email"], 30)
        if not matches(body.password, user["password_hash"]):
            raise HTTPException(400, "Incorrect password")
        workspace = user["workspace_id"]
        revisions = "SELECT id FROM web_revisions WHERE workspace_id=%s"
        requests = (
            "SELECT unnest(ARRAY[liquidity_request,investment_request]) "
            "FROM web_revisions WHERE workspace_id=%s"
        )
        recs = f"SELECT id FROM recommendations WHERE request_id IN ({requests})"
        imports = "SELECT id FROM statement_imports WHERE scope=%s"
        for table in ("audit_events", "simulated_applications"):
            conn.execute(f"DELETE FROM {table} WHERE recommendation_id IN ({recs})", (workspace,))
        conn.execute(f"DELETE FROM recommendations WHERE request_id IN ({requests})", (workspace,))
        conn.execute(f"DELETE FROM web_simulations WHERE revision IN ({revisions})", (workspace,))
        conn.execute("DELETE FROM web_revisions WHERE workspace_id=%s", (workspace,))
        conn.execute("DELETE FROM cfo_users WHERE id=%s", (user["id"],))
        conn.execute("DELETE FROM web_workspaces WHERE id=%s", (workspace,))
        for table in ("category_overrides", "invoice_match_decisions", "transactions"):
            conn.execute(f"DELETE FROM {table} WHERE import_id IN ({imports})", (str(workspace),))
        conn.execute("DELETE FROM category_rules WHERE scope=%s", (str(workspace),))
        conn.execute("DELETE FROM statement_imports WHERE scope=%s", (str(workspace),))
    response.delete_cookie(COOKIE)
    return {"ok": True}
