from decimal import Decimal, InvalidOperation
from pathlib import Path

import pandas as pd
import plotly.graph_objects as go
import streamlit as st

from cfo.finance import daily_balances
from cfo.ingestion import parse_statement

st.set_page_config(page_title="Autonomous CFO", layout="wide")
st.title("Autonomous CFO")
st.caption("Collabothon 2026 · Historical analysis · No banking actions")
uploaded = st.file_uploader("Bank statement CSV", type=["csv"])
opening_text = st.text_input("Opening balance in EUR (before the first value date)", "0.00")
st.info(
    "The sample has no opening balance. Zero is an explicit demo assumption. "
    "This chart shows historical data, not a forecast."
)
try:
    source = (
        uploaded.getvalue()
        if uploaded
        else (Path(__file__).parent / "data/sample/pizzeria-amalfi-2025.csv").read_bytes()
    )
    transactions = parse_statement(source)
    points = daily_balances(transactions, Decimal(opening_text))
except (ValueError, InvalidOperation, pd.errors.ParserError) as exc:
    st.error(str(exc))
    st.stop()

left, middle, right = st.columns(3)
left.metric("Transactions", len(transactions))
middle.metric("Closing balance", f"€{points[-1].balance:,.2f}")
lowest = min(points, key=lambda p: p.balance)
right.metric("Minimum balance", f"€{lowest.balance:,.2f}")
st.caption(f"Minimum on {lowest.day}. CHF conversions use the rate in each sample reference.")
figure = go.Figure(
    go.Scatter(
        x=[p.day for p in points], y=[float(p.balance) for p in points], name="Historical balance"
    )
)
figure.add_hline(y=0, line_dash="dash")
figure.update_layout(yaxis_title="EUR", xaxis_title="Value date")
st.plotly_chart(figure, use_container_width=True)
st.dataframe(
    pd.DataFrame([t.model_dump(mode="json") for t in transactions]), use_container_width=True
)
st.info(
    "Next milestone: dated forecast assumptions, two scenarios, model recommendations, "
    "and approval-dependent simulated execution with a database audit trail."
)
