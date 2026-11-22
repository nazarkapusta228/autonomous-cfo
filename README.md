# Project Name

Autonomous CFO

## One-Line Summary

Autonomous CFO helps small business owners forecast daily cash balances, spot upcoming shortfalls and compare ways to cover them before bills are due.

## Technology Stack

- **Languages:** Python, JavaScript, SQL, HTML and CSS
- **Frontend:** React 18, Vite and Recharts
- **Backend and APIs:** FastAPI, Pydantic, HTTPX, a REST API for the dashboard and an OpenAI-compatible API for model inference
- **Database:** PostgreSQL 16 with Psycopg
- **AI and infrastructure:** Qwen2.5-7B-Instruct served by vLLM through KServe on Red Hat OpenShift AI, with one NVIDIA GPU allocated for inference
- **Development and testing:** Docker Compose, Git, pytest and Playwright

## Project Overview

### THE PROBLEM

A pizzeria can finish the month with money in the bank and still struggle to pay wages on Tuesday if a customer pays on Friday. The bank statement shows what has already cleared, while invoices and the cash flow plan show what is still due. A small business owner has to bring those records together to answer a practical question: **On which day could cash run short, and how much would I need to cover the gap?**

### YOUR SOLUTION

Autonomous CFO combines bank transactions, invoices and planned payments into a daily cash forecast. The owner sets the minimum balance they want to keep. The Liquidity Agent identifies the first day the balance is projected to fall below that reserve and calculates how much funding would cover the deepest gap.

The forecast adapts to the business’s payment history. It tests several forecasting methods on earlier months, selects the one that best tracked daily cash movements and combines its projections with known commitments. If funding is needed, the owner can compare an overdraft with a credit line and see how each would affect cash, interest and repayment timing.

### THE WORKING PROTOTYPE

1. **Import business data.** After email verification, the owner enters an empty workspace. They can upload a bank statement, enter an opening balance and add a cash flow plan or invoices.
2. **Inspect the forecast.** The owner can view one, two or three months of projected daily balances, set a reserve and see when cash is expected to reach its lowest point.
3. **Test an operating change.** The owner can select a cost category found in their transactions, such as rent or payroll, enter a percentage increase or decrease and compare the result with the original forecast. They can also explore what happens if receipts arrive late.
4. **Review a funding decision.** The agent explains the projected shortfall or recommends holding cash. When it proposes credit, the owner can change the annual interest rate and compare borrowing costs, peak debt and the projected payoff date. Credit actions are simulations.

### BEHIND THE BUILD

During the hackathon, we built the data import and invoice matching logic, forecasting engine, credit simulator and dashboard. React and Recharts display the results, FastAPI connects the interface to the Python calculations, and PostgreSQL stores each workspace and its decisions.

The forecasting engine compares seven methods using historical windows of one, three, six or twelve months. Some give recent months more weight. With twelve complete months of data, the engine makes eleven monthly comparisons. At each step, it uses only earlier months to predict the next one and measures how far the forecast drifts from the actual cash movement at each daily close. We chose this measure because a forecast can get the month-end total right while missing a mid-month cash shortage.

Python calculates the balances, funding amounts and dates. Qwen runs on Red Hat OpenShift AI and uses those figures to explain the recommendation in plain language.

### CHALLENGES AND DISCOVERIES

One supplier bill can appear in the cash flow plan, the invoice list and the bank statement. Counting it several times would create a false cash shortage. We used invoice IDs to link records, matched settled invoices to bank transactions and let known commitments replace matching historical estimates.

Testing the credit simulator revealed another detail: a higher interest rate can increase the cost of borrowing while the payoff date stays the same. If Friday’s customer payment still covers the outstanding debt, the business can repay on Friday under either rate. This is why the prototype shows both total interest and repayment timing.

### RESULTS AND NEXT STEPS

We tested the forecast with a sample pizzeria statement containing **1,125 transactions across twelve months**. All five forecast-analysis tests passed. They cover at-risk payments, settled invoices, credit drawdown and repayment, and consistency across forecast periods. One test verifies that extending a forecast from 28 to 90 days preserves the projected balance on each of the first 28 days.

The result we are most proud of is that an owner can trace a funding proposal back to a specific day, inspect the payments behind it and see which future receipts could repay the debt. Our validation so far covers one sample business. Next, we want to measure forecast error across different businesses and test whether owners can use the recommendation to make a funding decision before a bill comes due.

## Source Code Repository

[github.com/nazarkapusta228/autonomous-cfo](https://github.com/nazarkapusta228/autonomous-cfo)

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

For frontend development, run `npm run dev --prefix view` alongside FastAPI and open [the frontend](http://127.0.0.1:5173).

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
