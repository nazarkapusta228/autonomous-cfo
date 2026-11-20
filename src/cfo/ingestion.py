"""Parsers for the sample bank statement and planned EUR cash flows."""

import re
from csv import DictReader, Error
from datetime import datetime
from decimal import ROUND_HALF_UP, Decimal
from io import BytesIO, StringIO

import pandas as pd

from cfo.models import PlannedCashFlow, Transaction

REQUIRED = {
    "Account Number",
    "Booking Date",
    "Value Date",
    "Transaction Type",
    "Payment Reference",
    "Amount",
    "Currency",
    "Info",
}


def parse_statement(content: bytes) -> list[Transaction]:
    frame = pd.read_csv(
        BytesIO(content), sep=";", dtype=str, keep_default_na=False, encoding="utf-8-sig"
    )
    if missing := REQUIRED - set(frame.columns):
        raise ValueError(f"Missing CSV columns: {', '.join(sorted(missing))}")
    if frame.empty:
        raise ValueError("The statement has no transactions")
    if frame["Account Number"].nunique() != 1:
        raise ValueError("Import one account at a time")
    result = []
    for number, row in enumerate(frame.to_dict("records"), start=2):
        try:
            if row["Info"] != "Transaction booked":
                raise ValueError("Only booked transactions are supported")
            if not re.fullmatch(r"-?(?:\d+|\d{1,3}(?:\.\d{3})+),\d{2}", row["Amount"]):
                raise ValueError("Expected a German amount with two decimal places")
            amount = Decimal(row["Amount"].replace(".", "").replace(",", "."))
            currency = row["Currency"]
            converted = amount
            if currency == "CHF":
                rate = re.search(r"@\s*(\d+(?:\.\d+)?)\s+EUR/CHF", row["Payment Reference"])
                if rate is None or Decimal(rate[1]) <= 0:
                    raise ValueError("CHF transaction has no positive EUR/CHF rate")
                converted = (amount * Decimal(rate[1])).quantize(
                    Decimal("0.01"), rounding=ROUND_HALF_UP
                )
            result.append(
                Transaction(
                    source_row=number,
                    account=row["Account Number"],
                    booked_on=datetime.strptime(row["Booking Date"], "%d.%m.%y").date(),
                    value_on=datetime.strptime(row["Value Date"], "%d.%m.%y").date(),
                    kind=row["Transaction Type"],
                    counterparty=row.get("Beneficiary/Payer", ""),
                    reference=row["Payment Reference"],
                    amount=amount,
                    currency=currency,
                    amount_eur=converted,
                )
            )
        except ValueError as exc:
            raise ValueError(f"CSV row {number}: {exc}") from exc
    return sorted(result, key=lambda transaction: (transaction.value_on, transaction.source_row))


def parse_cash_flow_plan(content: bytes) -> list[PlannedCashFlow]:
    """Read a UTF-8 CSV with ISO dates and signed EUR amounts using a decimal point."""
    reader = DictReader(StringIO(content.decode("utf-8-sig"), newline=""), strict=True)
    columns = ("date", "category", "amount_eur", "description")
    try:
        header = reader.fieldnames or []
        if len(set(header)) != len(header) or set(header) not in (
            set(columns),
            {*columns, "invoice_id"},
        ):
            raise ValueError(f"Cash flow plan columns must be {', '.join(columns)}")
        flows = []
        for row in reader:
            try:
                if None in row or any(value is None for value in row.values()):
                    raise ValueError("Unexpected or missing CSV fields")
                if "invoice_id" in row and not row["invoice_id"].strip():
                    row["invoice_id"] = None
                flows.append(PlannedCashFlow.model_validate(row))
            except ValueError as exc:
                raise ValueError(f"Cash flow plan row {reader.line_num}: {exc}") from exc
    except Error as exc:
        raise ValueError(f"Cash flow plan row {reader.line_num}: {exc}") from exc
    return sorted(flows, key=lambda flow: flow.date)
