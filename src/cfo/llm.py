import json
from datetime import date
from decimal import Decimal
from typing import Annotated, Literal

import httpx
from pydantic import BaseModel, ConfigDict, Field, ValidationError

from cfo.agent_types import Role
from cfo.config import Settings
from cfo.models import Money


class ModelError(ValueError):
    """Safe for display and logging; no token, prompt or response body attached."""

    def __init__(self, code: str, message: str, *, retryable: bool = False):
        super().__init__(message)
        self.code = code
        self.retryable = retryable


class Brief(BaseModel):
    model_config = ConfigDict(extra="forbid")

    action: Literal["hold", "propose_credit", "propose_investment"]
    amount: Annotated[Money, Field(ge=0)]
    execute_on: date
    # Select grounded sentences from this request's evidence and options.
    evidence_ids: list[Annotated[int, Field(strict=True, ge=0)]] = Field(max_length=3)
    next_step: str
    risk_ids: list[str] = Field(min_length=1, max_length=3)


def _brief_schema(context: dict) -> dict:
    """Constrain decoding to the facts and choices available for this forecast."""
    schema = Brief.model_json_schema()
    fields = schema["properties"]
    for name, value in context["proposal"].items():
        fields[name] = {"type": "string", "enum": [value]}
    evidence_ids = list(context["evidence"])
    fields["evidence_ids"] = {
        "type": "array",
        "items": {"type": "integer", "enum": evidence_ids} if evidence_ids else {"type": "integer"},
        "minItems": int(bool(evidence_ids)),
        "maxItems": min(3, len(evidence_ids)),
    }
    fields["next_step"] = {"type": "string", "enum": list(context["next_steps"])}
    fields["risk_ids"]["items"] = {"type": "string", "enum": list(context["risks"])}
    return schema


def recommend(settings: Settings, role: Role, context: dict) -> Brief:
    if not settings.llm_base_url or not settings.llm_model:
        raise ModelError("configuration", "Configure the Qwen serving URL and served model name.")
    headers = {}
    if token := settings.llm_api_key.get_secret_value():
        headers["Authorization"] = f"Bearer {token}"
    payload = {
        "model": settings.llm_model,
        "temperature": 0,
        "max_tokens": 550,
        "messages": [
            {
                "role": "system",
                "content": (
                    f"You are the {role} analyst for a simulated small-business CFO. "
                    "Explain the forecast to the owner by selecting the clearest grounded evidence "
                    "and next step. Copy action, amount and execute_on exactly from proposal. "
                    "Rank up to three supplied evidence_ids by relevance; select at least one "
                    "if any are given. Select one next_step key and relevant risk_ids from the "
                    "options. Use each ID only once. Never execute or approve an action."
                ),
            },
            {"role": "user", "content": json.dumps(context)},
        ],
        "response_format": {
            "type": "json_schema",
            "json_schema": {
                "name": "cfo_recommendation",
                "schema": _brief_schema(context),
            },
        },
    }
    try:
        with httpx.Client(timeout=settings.llm_timeout_seconds) as client:
            response = client.post(
                settings.llm_base_url.rstrip("/") + "/chat/completions",
                json=payload,
                headers=headers,
            )
    except (httpx.InvalidURL, httpx.UnsupportedProtocol):
        raise ModelError("configuration", "Set a valid HTTP(S) model URL including /v1.") from None
    except httpx.RequestError:
        raise ModelError(
            "unavailable", "Could not reach Qwen. Retry the analysis.", retryable=True
        ) from None
    if not response.is_success:
        retry = response.status_code in (408, 429) or response.status_code >= 500
        hint = (
            "Retry the analysis."
            if retry
            else "Check model name, authorization, URL and JSON Schema support."
        )
        raise ModelError(
            "endpoint_error", f"Qwen returned HTTP {response.status_code}. {hint}", retryable=retry
        )
    try:
        choice = response.json()["choices"][0]
        if choice["finish_reason"] != "stop":
            raise ValueError("Incomplete")
        # Parse JSON numerics as Decimal before Pydantic checks the monetary echo.
        content = choice["message"]["content"]
        return Brief.model_validate(json.loads(content, parse_float=Decimal))
    except (ValueError, IndexError, KeyError, TypeError, ValidationError):
        raise ModelError(
            "invalid_response",
            "Qwen returned an invalid or incomplete response. Retry the analysis.",
            retryable=True,
        ) from None
