from cfo.agent_types import AgentRecommendation, ReceiptDelay, Role
from cfo.agents.policy import proposal_fields
from cfo.config import Settings
from cfo.llm import ModelError, recommend
from cfo.models import LiquidityForecast

STEPS = {
    "propose_credit": {
        "facility": "Ask Commerzbank about a credit line before the reserve is breached.",
        "receipts": "Confirm expected receipt dates before approving a credit-line request.",
    },
    "propose_investment": {
        "deposit": "Request a Commerzbank term-deposit quote within the forecast window.",
        "access": "Confirm the withdrawal terms before committing the available surplus.",
    },
    "hold": {
        "monitor": "Keep monitoring the plan as new receipts and bills are confirmed.",
        "dates": "Verify the dates of upcoming payments and receipts before changing the plan.",
    },
}
RISKS = {
    "receipts": "Expected receipts may settle later than planned.",
    "costs": "Expenses may exceed the plan.",
    "credit": "The lender has not confirmed availability, fees or repayment terms.",
    "deposit": "Actual deposit maturity and early withdrawal terms require a bank quote.",
    "horizon": "Cash requirements beyond this forecast are unknown.",
}
CATEGORIES = {
    "payroll",
    "rent",
    "suppliers",
    "utilities",
    "tax",
    "fees",
    "insurance",
    "loan",
    "invoice",
    "supplier",
    "taxes",
    "revenue",
    "procurement",
    "payables",
    "receivables",
    "investment",
}


def review(
    settings: Settings, role: Role, f: LiquidityForecast, receipt_delays: tuple[ReceiptDelay, ...]
) -> AgentRecommendation:
    fields = proposal_fields(role, f)
    action = fields["action"]
    risk_options = {k: RISKS[k] for k in ("receipts", "costs", "horizon")}
    if action == "propose_credit":
        risk_options["credit"] = RISKS["credit"]
    if action == "propose_investment":
        risk_options["deposit"] = RISKS["deposit"]
    # Include the first breach's outflow and the largest later pressures. Only
    # canonical categories reach Qwen; descriptions and raw bank references never do.
    drivers = sorted(f.drivers, key=lambda d: (d.date != f.funding_needed_by, d.amount_eur, d.date))
    evidence = []
    for d in drivers[:6]:
        category = d.category if d.category in CATEGORIES else "scheduled expense"
        evidence.append(f"{d.date}: {category} outflow of EUR {abs(d.amount_eur):.2f}.")
    local_evidence = evidence.copy()
    for delay in sorted(receipt_delays, key=lambda r: (-r.amount_eur, r.due_on))[:3]:
        # Only dates, amounts and counts reach the model. Restore the owner-facing label locally.
        fact = (
            f"Receipt of EUR {delay.amount_eur:.2f} due {delay.due_on} is expected "
            f"{delay.expected_on}. Customer paid late {delay.late_payments}/{delay.payments} "
            "times in the matched history."
        )
        evidence.append(fact)
        local_evidence.append(f"{delay.counterparty}, invoice {delay.invoice_id}: {fact}")
    first_negative = f.as_of if f.opening_balance < 0 else f.first_deficit_on
    horizon = f.daily_balances[-1].day if f.daily_balances else f.as_of
    summary = (
        f"Forecast through {horizon}: minimum daily closing balance "
        f"EUR {f.minimum_balance:.2f} on {f.minimum_on}. "
    )
    if first_negative is not None:
        summary += f"First negative balance on {first_negative}. "
    else:
        summary += "No negative daily balance is projected. "
    if action == "propose_credit":
        summary += f"The plan needs EUR {fields['amount']:.2f} by {fields['execute_on']}. "
    if role == "investment":
        summary += (
            f"Opening cash covers EUR {fields['operating_cash']:.2f} of operating needs, "
            f"EUR {fields['reserve_cash']:.2f} of reserve and "
            f"EUR {fields['free_cash']:.2f} of surplus. "
        )
        if action == "propose_investment":
            summary += f"Limit the deposit term to {fields['available_until']}. "
    context = {
        "as_of": f.as_of.isoformat(),
        "opening_eur": str(f.opening_balance),
        "reserve_eur": str(f.reserve),
        "forecast_end": horizon.isoformat(),
        "facts": summary,
        "evidence": dict(enumerate(evidence)),
        "proposal": {k: str(fields[k]) for k in ("action", "amount", "execute_on")},
        "first_reserve_breach": f.funding_needed_by.isoformat() if f.funding_needed_by else None,
        "next_steps": STEPS[action],
        "risks": risk_options,
    }
    brief = recommend(settings, role, context)
    if (
        (brief.action, brief.amount, brief.execute_on)
        != (action, fields["amount"], fields["execute_on"])
        or bool(evidence) != bool(brief.evidence_ids)
        or any(i >= len(evidence) for i in brief.evidence_ids)
        or len(set(brief.evidence_ids)) != len(brief.evidence_ids)
        or brief.next_step not in STEPS[action]
        or any(k not in risk_options for k in brief.risk_ids)
        or len(set(brief.risk_ids)) != len(brief.risk_ids)
    ):
        raise ModelError(
            "policy_mismatch",
            "Qwen's recommendation did not match the forecast. Retry the analysis.",
            retryable=True,
        )
    explanation = " ".join(
        [
            summary.strip(),
            *(local_evidence[i] for i in brief.evidence_ids),
            STEPS[action][brief.next_step],
        ]
    )
    return AgentRecommendation(
        **fields, explanation=explanation, risks=[risk_options[k] for k in brief.risk_ids]
    )
