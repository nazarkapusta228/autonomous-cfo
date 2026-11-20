from datetime import date
from decimal import Decimal
from pathlib import Path

from cfo.analysis import Analysis, prepare_analysis

DATA = Path(__file__).resolve().parents[1] / "data/sample"
STATEMENT = (DATA / "pizzeria-amalfi-2025.csv").read_bytes()
PLAN = (DATA / "pizzeria-amalfi-liquidity-plan.csv").read_bytes()
OPTIONS = {"as_of": date(2025, 5, 31), "starting_balance": Decimal("2500")}


def test_demo_links_first_at_risk_payment_to_baseline():
    run = prepare_analysis(STATEMENT, PLAN, **OPTIONS)
    assert run.forecast.funding_needed == Decimal("10843.69")
    assert [(x.date, x.amount_eur) for x in run.payments_at_risk] == [
        (date(2025, 6, 13), Decimal("-3500.00"))
    ]
    assert run == Analysis.model_validate_json(run.model_dump_json())


def test_settled_invoice_replaces_linked_planned_outflow():
    invoices = (
        b"invoice_id;counterparty;issued_on;due_on;amount_eur\n"
        b"AS-37391;Asimex;2025-05-01;2025-06-02;-623.63\n"
        b"TEST-2;Asimex;2025-05-20;2025-06-20;-100.00\n"
    )
    plan = (
        b"date,category,amount_eur,description,invoice_id\n"
        b"2025-06-02,supplies,-623.63,Paid,AS-37391\n"
        b"2025-06-20,supplies,-100.00,Unpaid,TEST-2\n"
    )
    run = prepare_analysis(STATEMENT, plan, invoices=invoices, **OPTIONS)
    assert list(run.reconciliation.settled) == ["AS-37391"]
    assert [p.invoice_id for p in run.plan] == ["TEST-2"]
    assert run.forecast.daily_balances[-1].balance == Decimal("1906.31")


def test_credit_counterfactual_repayment_is_not_operating_income():
    from cfo.agent_types import AgentRecommendation
    from cfo.agents.policy import proposal_fields
    from cfo.scenarios import SettlementTerms, compare_scenarios

    forecast = prepare_analysis(STATEMENT, PLAN, **OPTIONS).forecast
    proposal = AgentRecommendation(
        **proposal_fields("liquidity", forecast), explanation="Scenario", risks=["Funding risk"]
    )
    preview = compare_scenarios(
        forecast, proposal, SettlementTerms(settles_on=date(2025, 7, 15), interest_eur="100.00")
    )
    adjusted = {p.day: p.balance for p in preview.with_action}
    assert adjusted[date(2025, 6, 30)] == 0
    assert adjusted[date(2025, 7, 15)] == forecast.daily_balances[-1].balance - Decimal(100)
    assert preview.outstanding_principal == 0
