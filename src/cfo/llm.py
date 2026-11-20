import json

import httpx

from cfo.config import Settings
from cfo.models import Recommendation


def recommend(settings: Settings, role: str, context: dict) -> Recommendation:
    if not settings.llm_base_url or not settings.llm_model:
        raise ValueError("Configure LLM_BASE_URL (including /v1) and LLM_MODEL")
    headers = {}
    if token := settings.llm_api_key.get_secret_value():
        headers["Authorization"] = f"Bearer {token}"
    payload = {
        "model": settings.llm_model,
        "temperature": 0,
        "max_tokens": 1200,
        "messages": [
            {
                "role": "system",
                "content": (
                    f"You are the {role} analyst for a simulated SME CFO. "
                    "Use only the supplied aggregates. Return a recommendation, never execute it. "
                    "Do not invent rates, products or guarantees. Include limitations and risks."
                ),
            },
            {"role": "user", "content": json.dumps(context)},
        ],
        "response_format": {
            "type": "json_schema",
            "json_schema": {
                "name": "recommendation",
                "schema": Recommendation.model_json_schema(),
            },
        },
    }
    with httpx.Client(timeout=settings.llm_timeout_seconds) as client:
        response = client.post(
            settings.llm_base_url.rstrip("/") + "/chat/completions", json=payload, headers=headers
        )
        response.raise_for_status()
    message = response.json()["choices"][0]
    if message.get("finish_reason") != "stop":
        raise ValueError("The model response is incomplete")
    return Recommendation.model_validate_json(message["message"]["content"])
