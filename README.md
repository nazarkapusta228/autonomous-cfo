# Autonomous CFO

Autonomous CFO helps a business see when cash may run short and how much it can set aside. It combines bank statements, planned payments and invoices in one forecast. Two agents use Qwen on OpenShift AI to explain liquidity and investment decisions. Approving a proposal records a simulation. Bank transfers and tax filings require separate action.

[Open the dashboard](https://autonomous-cfo-autonomous-cfo.apps.ocp.dtnkb.sandbox1202.opentlc.com/)

## Using the dashboard

1. **Create an account.** Enter your name, email and password, then enter the verification code sent to your email. Codes expire after 20 minutes. Sign-in lasts seven days. Use **My profile** to change your details or delete your account and workspace. Resetting your password signs you out of all sessions.
2. **Import data.** In **Data**, select **Bank statement** for booked transactions, **Cash flow plan** for expected payments and income, or **Invoices** for amounts owed or due. Upload a CSV, tabular TXT file or JSON array of objects. Current data can be exported as CSV, TXT, JSON or PDF. A [sample statement](data/sample/pizzeria-amalfi-2025.csv) is included.
3. **Review cash and payments.** The **Dashboard** shows balances, outstanding payables and spending trends. Use **Transactions** to filter bank entries, correct a payment or resolve an invoice match. Category and transaction-type edits can affect payments outside the current date filter.
4. **Review a decision.** In **Liquidity Agent**, set the opening balance, reserve and forecast dates. Run the forecast, inspect the planned payments, then run the agent. Compare available credit options if funding is needed. **Investment Agent** checks how much cash can be set aside while maintaining the reserve.
5. **Compare scenarios.** Open **Simulations** to explore changes in rent, payroll or payment timing, or to compare tax, currency and financing assumptions.

## Local setup

Use Python 3.12 or later, Node.js 22 and Docker Compose. Run these commands from the repository root.

```sh
python3.12 -m venv .venv
source .venv/bin/activate
pip install -e '.[dev]'
cp -n .env.example .env
docker compose up -d --wait db
npm ci --prefix view
npm run build --prefix view
python -m uvicorn cfo.web:app --port 8080
```

Open [the local dashboard](http://127.0.0.1:8080). Compose applies the SQL migrations when it creates the database. For an existing volume, run the migrations in order before starting the app.

```sh
(for f in sql/*.sql; do docker compose exec -T db psql -v ON_ERROR_STOP=1 -U cfo -d cfo < "$f" || exit 1; done)
```

Account verification requires email delivery. For local use, the example settings connect to a [private Mailpit inbox](docs/deployment.md#private-email-preview). To use the cluster model, sign in with the OpenShift CLI and keep the following command running in another terminal.

```sh
oc -n autonomous-cfo port-forward deployment/cfo-qwen-predictor 18481:8080
```

The ledger and baseline forecast work offline once signed in. For live interface changes, run `npm run dev --prefix view` alongside FastAPI and open [the frontend](http://127.0.0.1:5173).

## Documentation

- [Data formats and forecast assumptions](docs/data-notes.md)
- [Agents, decisions and storage](docs/architecture.md)
- [Command-line and API reference](docs/agent-backend.md)
- [OpenShift deployment and email configuration](docs/deployment.md)

## Tests

```sh
TEST_DATABASE_URL=postgresql://cfo:cfo_local_only@localhost:5432/cfo pytest -q
ruff check .
npm run build --prefix view
```

The browser tests require a running app, a reachable model and a private Mailpit inbox. Set `CFO_URL` and `CFO_MAILBOX_URL` if they differ from the local defaults. The tests create and remove their own account.

```sh
(cd view && npx playwright install chromium)
npm run test:e2e --prefix view
```
