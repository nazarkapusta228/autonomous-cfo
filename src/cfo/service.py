"""Backend entry points for running and resuming a single agent assessment."""

from uuid import UUID

from cfo.agent_types import Role
from cfo.agents import investment, liquidity
from cfo.analysis import Analysis
from cfo.config import Settings
from cfo.workflow import (
    StoredRecommendation,
    find_by_request_id,
    get_recommendation,
    save_recommendation,
)


def database_dsn(settings: Settings) -> str:
    if not settings.database_url or not settings.database_url.get_secret_value():
        raise ValueError("Set DATABASE_URL to store or review a recommendation")
    return settings.database_url.get_secret_value()


def assess(
    settings: Settings, analysis: Analysis, role: Role, *, request_id: UUID
) -> StoredRecommendation:
    """One UUID per scenario and agent. Reruns return the original saved decision."""
    modules = {"liquidity": liquidity, "investment": investment}
    if role not in modules:
        raise ValueError("Select a known agent")
    if analysis.reconciliation.ambiguous:
        raise ValueError("Resolve ambiguous invoice payments before asking for a recommendation")
    dsn = database_dsn(settings)
    context = analysis.model_dump(mode="json", exclude={"forecast", "plan_keys"})
    context["role"] = role
    context["model"] = settings.llm_model
    saved = find_by_request_id(dsn, request_id)
    if saved is not None:
        if saved.forecast != analysis.forecast or saved.context != context:
            raise ValueError("This request ID belongs to a different analysis")
        return saved
    proposal = modules[role].analyse(
        settings, analysis.forecast, receipt_delays=tuple(analysis.receipt_delays)
    )
    item_id = save_recommendation(
        dsn,
        analysis.forecast,
        proposal,
        agent=role,
        request_id=request_id,
        context=context,
    )
    return get_recommendation(dsn, item_id)
