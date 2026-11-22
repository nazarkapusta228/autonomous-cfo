# How Autonomous CFO works

The React dashboard sends workspace requests to FastAPI. PostgreSQL stores accounts, imported data, forecast settings and decisions. Python calculates the cash forecast. Qwen2.5-7B-Instruct on OpenShift AI helps explain the decision.

## Forecast calculation

1. Reconstruct the balance at the cut-off date from the opening balance and eligible bank transactions.
2. Compare seven historical models using up to 12 months of data. Each model averages payment streams over 1, 3, 6 or 12 months. The longer windows also have variants that give recent months more weight.
3. Predict each held-out month using only earlier months. Score the error in cumulative cash flow at each daily close. Twelve complete months provide eleven monthly comparisons. Use the winning model and its selected window to project future flows.
4. Combine the projection with the cash flow plan and reconciled invoices, apply saved payment edits and calculate daily closing balances against the reserve.

## Agent decisions

| Agent | Result |
| --- | --- |
| Liquidity | Proposes funding when projected cash falls below the reserve. The dashboard can compare a credit line with an overdraft. |
| Investment (CLI) | Assesses whether surplus cash can fund a term deposit within the forecast horizon. |

Python sets financial amounts and dates. Qwen selects evidence, risks and a next step from the forecast facts. Approving a proposal records a simulation and an audit entry. A hold decision requires no action.
