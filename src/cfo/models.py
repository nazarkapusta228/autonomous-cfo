from datetime import date
from decimal import Decimal
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field

Money = Annotated[Decimal, Field(max_digits=18, decimal_places=2, allow_inf_nan=False)]


class Transaction(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")

    source_row: int
    account: str
    booked_on: date
    value_on: date
    kind: str
    reference: str
    amount: Money
    currency: Literal["EUR", "CHF"]
    amount_eur: Money


class ForecastPoint(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")
    day: date
    balance: Money


class Recommendation(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    action: Literal["hold", "propose_credit", "propose_investment"]
    amount: Annotated[Money, Field(ge=0)]
    execute_on: date
    explanation: str = Field(min_length=1, max_length=4000)
    risks: list[str] = Field(min_length=1, max_length=10)
