from datetime import date
from decimal import Decimal
from pathlib import Path

from cfo.analysis import Analysis, prepare_analysis

DATA = Path(__file__).resolve().parents[1] / "data/sample"
STATEMENT = (DATA / "pizzeria-amalfi-2025.csv").read_bytes()
OPTIONS = {"as_of": date(2025, 5, 31), "starting_balance": Decimal("2500")}


def test_demo_links_first_at_risk_payment_to_baseline():
    run = prepare_analysis(STATEMENT, b"", as_of=OPTIONS["as_of"], starting_balance=Decimal(0))
    assert run.forecast.funding_needed == Decimal("4671.61")
    assert [(x.date, x.amount_eur) for x in run.payments_at_risk] == [
        (date(2025, 6, 1), Decimal("-267.06")),
        (date(2025, 6, 1), Decimal("-3800.00")),
        (date(2025, 6, 1), Decimal("-498.09")),
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
    assert [p.invoice_id for p in run.plan if p.invoice_id] == ["TEST-2"]
    baseline = prepare_analysis(STATEMENT, b"", **OPTIONS)
    assert (
        run.forecast.daily_balances[-1].balance
        == baseline.forecast.daily_balances[-1].balance - 100
    )


def test_credit_counterfactual_repayment_is_not_operating_income():
    from cfo.agent_types import AgentRecommendation
    from cfo.agents.policy import proposal_fields
    from cfo.scenarios import SettlementTerms, compare_scenarios

    forecast = prepare_analysis(
        STATEMENT, b"", as_of=OPTIONS["as_of"], starting_balance=Decimal(0)
    ).forecast
    proposal = AgentRecommendation(
        **proposal_fields("liquidity", forecast), explanation="Scenario", risks=["Funding risk"]
    )
    preview = compare_scenarios(
        forecast, proposal, SettlementTerms(settles_on=date(2025, 7, 15), interest_eur="100.00")
    )
    adjusted = {p.day: p.balance for p in preview.with_action}
    assert adjusted[forecast.minimum_on] == forecast.minimum_balance + proposal.amount
    assert adjusted[date(2025, 7, 15)] == forecast.daily_balances[-1].balance - Decimal(100)
    assert preview.outstanding_principal == 0


def test_credit_draws_on_cutoff_and_repays_from_surplus():
    from types import SimpleNamespace

    from cfo.forecast_tools import credit_path
    from cfo.models import ForecastPoint

    day = date(2025, 6, 1)
    forecast = SimpleNamespace(
        as_of=day,
        opening_balance=Decimal("-100"),
        reserve=Decimal(0),
        daily_balances=[ForecastPoint(day=date(2025, 6, 2), balance=Decimal("100"))],
    )
    proposal = SimpleNamespace(execute_on=day, amount=Decimal("150"))
    for product, peak, cost in [("overdraft", "100", ".10"), ("credit_line", "150", ".15")]:
        result = credit_path(forecast, proposal, product, Decimal("36.50"))
        assert result["peak"] == Decimal(peak) and result["interest"] == Decimal(cost)
        assert result["days_to_close"] == 1 and result["outstanding"] == 0


def test_twelve_month_walk_forward_and_nested_horizons():
    settings = dict(as_of=date(2025, 12, 31), starting_balance=Decimal(0))
    short = prepare_analysis(STATEMENT, b"", horizon_days=28, **settings)
    long = prepare_analysis(STATEMENT, b"", horizon_days=90, **settings)
    assert short.validation_months == long.validation_months == 11
    assert short.forecast.daily_balances == long.forecast.daily_balances[:28]
    assert short.error_scale > 0
