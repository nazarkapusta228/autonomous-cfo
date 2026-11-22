# Project Name

Autonomous CFO

## One-Line Summary

From first-time founders to family-business successors, turn transactions, invoices and plans into a daily cash forecast with an AI assistant and useful simulations to explore your next move.

## Technology Stack

- **Languages:** Python, JavaScript, SQL, HTML and CSS
- **Frontend:** React 18, Vite and Recharts
- **Backend and APIs:** FastAPI, Pydantic, HTTPX, a REST API for the dashboard and an OpenAI-compatible API for model inference
- **Database:** PostgreSQL 16 with Psycopg
- **AI and infrastructure:** Qwen2.5-7B-Instruct served by vLLM through KServe on Red Hat OpenShift AI, with one NVIDIA GPU allocated for inference
- **Development and testing:** Docker Compose, Git, pytest and Playwright

## Project Overview

### THE PROBLEM

A shop owner needs to know, “Can I pay my supplier today and still cover payroll on Friday?” Their bank balance tells only part of the story. Invoices have different due dates, and terms like *liquidity* or *funding gap* can make a finance dashboard hard to use.

In a Bluevine survey, 35% of respondents who used fintech said they used or wanted automated cash-flow forecasting. For owners without a finance team, the next challenge is understanding what the forecast means for a payment they need to make. [Bluevine survey](https://www.bluevine.com/blog/small-business-banking-gap-survey)

### YOUR SOLUTION

Autonomous CFO brings bank transactions, invoices and planned payments into one daily forecast. It shows when cash could run short, by how much, and which payments are due that day.

An optional interactive tour shows new users where to start. Clicking a financial term opens a short definition right where it appears. For a question about their own business, owners can ask the AI assistant, “Why might I run short next month?” and get an explanation based on their workspace data.

### THE WORKING PROTOTYPE

Users can upload a bank statement, add invoices and set a minimum cash reserve. The dashboard shows their projected balance for up to three months. They can then change a payment amount or delay an expected receipt and compare the outcome with the original forecast.

### BEHIND THE BUILD

We built the data import, invoice matching, forecasting engine, scenario simulator and guided interface during the hackathon. The dashboard uses React and Recharts, the backend uses FastAPI, and PostgreSQL stores each user’s workspace.

Python calculates the daily balances and funding gaps using decimal arithmetic. Qwen, served by vLLM on Red Hat OpenShift AI, uses those figures to answer questions in English, Polish or German.

### CHALLENGES AND DISCOVERIES

One invoice can appear in a plan and later in a bank statement. Counting both entries as future expenses creates a false shortfall. We match invoices to booked payments and flag uncertain matches.

We also found that “What does *reserve* mean?” and “Will I have enough to pay rent?” need different answers. A one-line definition handles the first. The second needs the owner’s dates, payments and forecast. That distinction shaped both the glossary and the assistant.

### RESULTS AND NEXT STEPS

We deployed Autonomous CFO on Red Hat OpenShift and tested the forecast against a month of bank records. Our June backtest showed that the business stayed below zero longer than its payment history suggested.

Our strongest result is a workflow an owner can follow from start to finish: spot a projected shortfall, find the payments due and try a different payment date. Next, we’ll measure how much upcoming invoices improve forecast accuracy and ask first-time users to complete that workflow without coaching.

## Source Code Repository

[github.com/nazarkapusta228/autonomous-cfo](https://github.com/nazarkapusta228/autonomous-cfo)

## Bonus challenges 
- Run the model using vLLM on Red Hat OpenShift AI.
- Use Jupyter Notebooks on Red Hat OpenShift AI.

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
