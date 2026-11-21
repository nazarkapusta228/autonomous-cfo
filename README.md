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

## Accounts and email

Apply the SQL migrations before starting FastAPI. Sign up with your name, email and password,
then paste the latest emailed code. If you reopen verification in a new browser session, enter your signup password as well. Codes expire after 20 minutes.
A verified account owns one workspace across browsers. Its HTTP-only session lasts 7 days from sign-in.
Password resets revoke all sessions. My profile supports a verified email change and
permanent account deletion, including that account’s imported statements and decisions.

For delivery to personal addresses, set SMTP_HOST, SMTP_PORT, SMTP_TLS (starttls or implicit),
SMTP_FROM, SMTP_USERNAME and SMTP_PASSWORD in the optional OpenShift Secret
`cfo-mail-delivery` or in your local .env. Use an address authorized by your mail provider. After changing the Secret, restart the application deployment to reload the SMTP settings.

For team testing, `oc apply -n autonomous-cfo -f deploy/openshift/mail-preview.yaml`
creates a private Mailpit mailbox and the matching ConfigMap. Team members can open
the mailbox at http://localhost:8025 after running
`oc -n autonomous-cfo port-forward deployment/cfo-mail-preview 8025:8025`.
All messages sent to this preview stay in the sandbox. For a local app connected to it,
also forward 1025:1025 and set SMTP_HOST=localhost, SMTP_PORT=1025, SMTP_TLS=plain
and SMTP_FROM=accounts@autonomous-cfo.invalid. To show an inbox link when running the app locally, set SMTP_PREVIEW_INBOX_URL to the HTTP loopback address of the forwarded mailbox.

## Walk through the demo

1. Review the Dashboard forecast, then open Liquidity Agent and run the agent. Set the starting balance to zero to exercise a shortfall scenario. Compare the two balance curves, then approve or reject.
2. Under Liquidity Agent set the starting balance to €25,000 and run the forecast.
   Under Investment Agent run the second agent to see the operating cash, reserve and deposit
   proposal. Changing the forecast creates a new decision context.
3. Under Transactions inspect the bank history, filter categories, correct a payment or
   resolve an ambiguous invoice. Open Data → Bank statement to import the example bank CSV. Data also accepts a cash flow plan or invoices in CSV, tabular TXT or JSON (an array of objects). Review column assignments and sample values before replacing a dataset. Export the current data as CSV, TXT, JSON or PDF, or click the uploaded filename for the original. Under Transactions, use Edit row for one payment or all payments of its type, including payments outside the current date filter.
4. Under Currency Exposure and Tax Payments enter the terms of a simulation. Money market and
   equipment finance enquiries are also available. The dashboard records each decision.

The original Streamlit
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
Set CFO_MAILBOX_URL to your private Mailpit HTTP endpoint (default http://localhost:8025). The test creates and removes its own account.
