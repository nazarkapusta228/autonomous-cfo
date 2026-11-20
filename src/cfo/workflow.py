"""Persist assessments and record the owner's decision within one database transaction."""

from datetime import datetime
from typing import Literal
from uuid import UUID

import psycopg
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb
from pydantic import BaseModel, ConfigDict

from cfo.agent_types import AgentRecommendation, Role
from cfo.agents.policy import validate_agent_recommendation
from cfo.models import LiquidityForecast

Decision = Literal["approve", "reject"]
Status = Literal["pending", "approved", "rejected", "simulated", "no_action"]


class AuditEvent(BaseModel):
    occurred_at: datetime
    actor: str
    event: str
    details: dict


class StoredRecommendation(BaseModel):
    model_config = ConfigDict(frozen=True)

    id: int
    request_id: UUID
    created_at: datetime
    agent: Role
    forecast: LiquidityForecast
    recommendation: AgentRecommendation
    context: dict
    status: Status
    application_id: int | None
    audit: list[AuditEvent]


_QUERY = """
    SELECT r.id, r.request_id, r.created_at, r.agent, r.scenario AS forecast,
           r.payload AS recommendation, r.context, r.status, a.id AS application_id,
           COALESCE((SELECT jsonb_agg(jsonb_build_object(
               'occurred_at', e.occurred_at, 'actor', e.actor, 'event', e.event,
               'details', e.details) ORDER BY e.id)
               FROM audit_events e WHERE e.recommendation_id = r.id), '[]'::jsonb) AS audit
    FROM recommendations r LEFT JOIN simulated_applications a ON a.recommendation_id = r.id
"""


def _get(conn, item_id: int) -> StoredRecommendation:
    row = conn.execute(_QUERY + " WHERE r.id=%s", (item_id,)).fetchone()
    if row is None:
        raise LookupError(f"Unknown recommendation {item_id}")
    return StoredRecommendation.model_validate(row)


def get_recommendation(database_url: str, item_id: int) -> StoredRecommendation:
    with psycopg.connect(database_url, row_factory=dict_row) as conn:
        return _get(conn, item_id)


def find_by_request_id(database_url: str, request_id: UUID) -> StoredRecommendation | None:
    with psycopg.connect(database_url, row_factory=dict_row) as conn:
        row = conn.execute(_QUERY + " WHERE r.request_id=%s", (request_id,)).fetchone()
        return StoredRecommendation.model_validate(row) if row is not None else None


def _record(conn, item_id: int, actor: str, event: str, **details) -> None:
    conn.execute(
        "INSERT INTO audit_events (recommendation_id,actor,event,details) VALUES (%s,%s,%s,%s)",
        (item_id, actor, event, Jsonb(details)),
    )


def save_recommendation(
    database_url: str,
    forecast: LiquidityForecast,
    recommendation: AgentRecommendation,
    *,
    agent: Role,
    request_id: UUID,
    context: dict,
    actor: str = "system",
) -> int:
    validate_agent_recommendation(agent, forecast, recommendation)
    actor = actor.strip()
    if not actor:
        raise ValueError("Actor must be nonempty")
    status = "no_action" if recommendation.action == "hold" else "pending"
    with psycopg.connect(database_url, row_factory=dict_row) as conn:
        inserted = conn.execute(
            "INSERT INTO recommendations(request_id, agent, payload, scenario, context, status) "
            "VALUES (%s, %s, %s, %s, %s, %s) ON CONFLICT (request_id) DO NOTHING RETURNING id",
            (
                request_id,
                agent,
                Jsonb(recommendation.model_dump(mode="json")),
                Jsonb(forecast.model_dump(mode="json")),
                Jsonb(context),
                status,
            ),
        ).fetchone()
        if inserted is None:
            # A concurrent rerun may have received a different grounded explanation.
            # Retain the first complete result for this exact input and role.
            row = conn.execute(_QUERY + " WHERE r.request_id=%s", (request_id,)).fetchone()
            saved = StoredRecommendation.model_validate(row)
            if (saved.agent, saved.forecast, saved.context) != (agent, forecast, context):
                raise ValueError("Request ID already belongs to a different assessment")
            return saved.id
        item_id = inserted["id"]
        _record(conn, item_id, actor, "assessed", action=recommendation.action)
        return item_id


def decide(
    database_url: str, item_id: int, decision: Decision, *, actor: str
) -> StoredRecommendation:
    """Serialize approvals/rejections of this snapshot; simulation never posts bank movements."""
    if decision not in ("approve", "reject") or not actor.strip():
        raise ValueError("A valid decision and nonempty actor are required")
    actor = actor.strip()
    with psycopg.connect(database_url, row_factory=dict_row) as conn:
        if (
            conn.execute(
                "SELECT id FROM recommendations WHERE id=%s FOR UPDATE", (item_id,)
            ).fetchone()
            is None
        ):
            raise LookupError(f"Unknown recommendation {item_id}")
        saved = _get(conn, item_id)
        target = "simulated" if decision == "approve" else "rejected"
        if saved.status == target:
            return saved
        if saved.status != "pending":
            raise ValueError(f"Cannot {decision} a recommendation in state {saved.status}")
        if decision == "approve":
            proposal = saved.recommendation
            validate_agent_recommendation(saved.agent, saved.forecast, proposal)
            if proposal.action == "hold":
                raise ValueError("There is no proposed financial action")
            _record(conn, item_id, actor, "approved")
            app = conn.execute(
                "INSERT INTO simulated_applications(recommendation_id, action, amount_eur, "
                "planned_on) VALUES (%s, %s, %s, %s) RETURNING id",
                (item_id, proposal.action, proposal.amount, proposal.execute_on),
            ).fetchone()
            _record(conn, item_id, actor, "simulated", application_id=app["id"])
        else:
            _record(conn, item_id, actor, "rejected")
        conn.execute("UPDATE recommendations SET status=%s WHERE id=%s", (target, item_id))
        return _get(conn, item_id)
