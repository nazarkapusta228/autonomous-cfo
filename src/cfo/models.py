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
    counterparty: str = ""
    reference: str
    amount: Money
    currency: Annotated[str, Field(pattern=r"^[A-Z]{3}$")]
    amount_eur: Money
    booked_rate: Annotated[Decimal, Field(gt=0)] | None = None


class ForecastPoint(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")
    day: date
    balance: Money


class PlannedCashFlow(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid", str_strip_whitespace=True)
    date: date
    category: str = Field(min_length=1)
    amount_eur: Money
    description: str = Field(min_length=1)
    invoice_id: str | None = Field(default=None, min_length=1)


class LiquidityForecast(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")
    as_of: date
    opening_balance: Money
    reserve: Annotated[Money, Field(ge=0)]
    daily_balances: list[ForecastPoint]
    first_deficit_on: date | None
    minimum_balance: Money
    minimum_on: date
    funding_needed: Annotated[Money, Field(ge=0)]
    funding_needed_by: date | None
    drivers: list[PlannedCashFlow]


class Recommendation(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    action: Literal["hold", "propose_credit", "propose_investment"]
    amount: Annotated[Money, Field(ge=0)]
    execute_on: date
    explanation: str = Field(min_length=1, max_length=4000)
    risks: list[str] = Field(min_length=1, max_length=10)
