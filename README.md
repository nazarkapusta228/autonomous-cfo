# Autonomous CFO

React dashboard for the Collabothon Pizzeria Amalfi challenge. FastAPI serves the dashboard,
runs the two Python agents and records decisions in PostgreSQL. Both agents call the same
Qwen2.5-7B-Instruct model on OpenShift AI. Financial movements and filings are simulations.

## Run on OpenShift

Open the team's `autonomous-cfo` HTTPS Route. The model, application and PostgreSQL run
inside the cluster. [Deployment and rebuild commands](docs/deployment.md).

## Run locally

From the repository root, with Python 3.12+, Node 22, Docker and access to the cluster:

```sh
python3.12 -m venv .venv
source .venv/bin/activate
pip install -e '.[dev]'
cp -n .env.example .env
docker compose up -d --wait db
for f in sql/*.sql; do docker compose exec -T db psql -v ON_ERROR_STOP=1 -U cfo -d cfo < "$f" || break; done
npm ci --prefix view
npm run build --prefix view
python -m uvicorn cfo.web:app --port 8080
```

Open http://127.0.0.1:8080. For local Qwen requests, log into the team cluster and keep
`oc -n autonomous-cfo port-forward deployment/cfo-qwen-predictor 18481:8080` running
in another terminal. The forecast and ledger work while the model is offline.
In PyCharm use module `uvicorn`, arguments `cfo.web:app --port 8080` and the repo root
as the working directory. For live React edits run `npm run dev --prefix view` alongside
FastAPI and open http://127.0.0.1:5173. API documentation is available at `/docs`.

## Walk through the demo

1. On Dashboard run the liquidity agent. The supplied assumptions give a shortfall of
   €10,843.69 by 13 June 2025. Compare the two balance curves, then approve or reject.
2. Under Liquidity Agent set the starting balance to €25,000 and run the forecast.
   Under Investment run the second agent to see the operating cash, reserve and deposit
   proposal. Changing the forecast creates a new decision context.
3. Under Transactions inspect the bank history, filter categories, correct a payment or
   resolve an ambiguous invoice. CSV uploads are under Liquidity Agent → Import CSV files.
4. Under FX Hedging and Tax planning enter the terms of a simulation. Money market and
   equipment finance enquiries are also available. The dashboard records each decision.

Each browser receives an isolated demo workspace via an HTTP-only cookie. Keep that cookie
to resume the same workspace. Use synthetic data in the public demo. The original Streamlit
history viewer remains available for developers through the optional `legacy` dependencies.

## Verification

```sh
TEST_DATABASE_URL=postgresql://cfo:cfo_local_only@localhost:5432/cfo pytest -q
ruff check .
npm run build --prefix view
```

[Agent and CLI contract](docs/agent-backend.md) · [Forecast assumptions](docs/data-notes.md)

To run the interactive regression against a running app and Qwen endpoint, install Chromium
with `(cd view && npx playwright install chromium)`, then run `npm run test:e2e --prefix view`.
Set `CFO_URL` for an OpenShift Route or `BROWSER_CHANNEL=chrome` to use installed Chrome.
The test creates its own isolated workspace and records simulated decisions.
