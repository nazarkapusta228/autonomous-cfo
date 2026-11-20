"""Parser for the supplied German-format sample statement, not arbitrary bank exports."""

import re
from datetime import datetime
from decimal import ROUND_HALF_UP, Decimal
from io import BytesIO

import pandas as pd

from cfo.models import Transaction

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
                    reference=row["Payment Reference"],
                    amount=amount,
                    currency=currency,
                    amount_eur=converted,
                )
            )
        except ValueError as exc:
            raise ValueError(f"CSV row {number}: {exc}") from exc
    return sorted(result, key=lambda transaction: (transaction.value_on, transaction.source_row))
