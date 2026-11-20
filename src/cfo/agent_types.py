from datetime import date
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from cfo.models import Money, Recommendation

Role = Literal["liquidity", "investment"]


class AgentRecommendation(Recommendation):
    product: Literal["credit_line", "term_deposit"] | None = None
    available_until: date | None = None
    operating_cash: Money | None = None
    reserve_cash: Money | None = None
    free_cash: Money | None = None


class ReceiptDelay(BaseModel):
    """A dated receipt affected by previously observed customer payment delays."""

    model_config = ConfigDict(frozen=True, extra="forbid")
    invoice_id: str
    counterparty: str
    amount_eur: Money
    due_on: date
    expected_on: date
    late_payments: int = Field(ge=1)
    payments: int = Field(ge=1)
