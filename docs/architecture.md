# Agents, decisions and storage

FastAPI serves the React dashboard and runs both Python agents. PostgreSQL stores accounts, workspace data, decisions and audit history. Both agents use the same Qwen2.5-7B-Instruct endpoint on OpenShift AI.

## From a statement to a forecast

The application categorizes booked transactions and reconciles invoices against the bank statement. The account owner can resolve ambiguous matches. The forecast combines the balance at the cut-off date with future cash flows, outstanding invoices and saved edits to planned payments. The dashboard and both agents read the same forecast. Monetary calculations use Python Decimal and PostgreSQL NUMERIC.

## What the agents decide

| Agent | Question | Result |
| --- | --- | --- |
| Liquidity | When will cash fall below the reserve, and by how much? | A proposed funding amount and date when cash is needed, or a decision to hold. |
| Investment | How much cash can be set aside without breaching the reserve? | A proposed term deposit within the forecast horizon, or a decision to hold. |

Python calculates the amounts, dates and term limits. The agents send forecast facts to Qwen through HTTPX. Qwen selects relevant evidence, risks and a next step. The application validates the response against the scenario and adds counterparty and account details locally.

## Decisions and audit history

Each assessment stores its forecast, inputs, recommendation, agent role and request UUID. The decision ID identifies the saved assessment; the simulation ID identifies a simulated action. Approval, creation of the simulated request and the audit entry are recorded in one database transaction. Rejection records the owner's decision. A hold recommendation receives the status `no_action`.

Scenario comparisons show how borrowing, repayment or deposit settlement would affect cash under the selected assumptions. Bank execution is established from booked transactions.

[Data and forecast assumptions](data-notes.md) · [Command-line reference](agent-backend.md)
