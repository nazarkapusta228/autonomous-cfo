import { usePreferences } from '../context/Preferences';
import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { nextDay } from '../lib/api';
import { BriefcaseBusiness, Coins } from 'lucide-react';
import DateField from './DateField';
import ApprovalModal from './ApprovalModal';

export default function SimulationForm({
  kind,
  title,
  description,
  suggested = '',
  suggestedDate,
}) {
  const { t: tr, money: eur } = usePreferences();
  const { state, busy, submit } = useApp();
  const [enteredAmount, setAmount] = useState(null);
  const amount = enteredAmount ?? suggested;
  const [date, setDate] = useState(suggestedDate || nextDay(state.settings.as_of));
  const [rate, setRate] = useState('');
  const [confirm, setConfirm] = useState(false);
  const fx = kind === 'fx_forward';
  const fund = kind === 'money_market';
  const assessed = Boolean(state.assessments.investment);
  const free = Number(state.assessments.investment?.recommendation.free_cash ?? 0);
  const needsAssessment = fund && !assessed;
  const noSurplus = fund && assessed && free <= 0;
  const blocked = needsAssessment || noSurplus;
  const labels = {
    fx_forward: tr("Review CHF forward"),
    money_market: tr("Review fund enquiry"),
    capex: tr("Review equipment financing"),
    tax_prepayment: tr("Review tax prepayment"),
  };
  const lastRate = state.fx.rates.at(-1);
  const unit = fx ? 'CHF' : 'EUR';
  const records = state.simulations.filter((s) => s.kind === kind);
  async function approve() {
    const fields = { kind, amount, effective_on: date };
    if (fx) fields.eur_per_chf = rate;
    if (await submit('simulations', fields)) setConfirm(false);
  }
  return (
    <section className="card mb-4">
      <div className="card-title">{title}</div>
      <p className="card-sub">{description}</p>
      <form
        className="scenario-form"
        onSubmit={(e) => {
          e.preventDefault();
          setConfirm(true);
        }}
      >
        <div className="controls">
          <label> {tr("Scenario amount (")}{unit})
            <input
              type="number"
              step=".01"
              min=".01"
              max={fund && free > 0 ? free : undefined}
              required
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </label>
          <DateField
            label={tr("Effective date")}
            value={date}
            onChange={setDate}
            min={nextDay(state.settings.as_of)}
            shortcuts={[
              [tr("Next day"), nextDay(state.settings.as_of)],
              [tr("Forecast end"), state.analysis.forecast.daily_balances.at(-1).day],
            ]}
          />
          {fx && (
            <label> {tr("Assumed EUR per CHF")} <input
                type="number"
                required
                step=".000001"
                min=".000001"
                value={rate}
                onChange={(e) => setRate(e.target.value)}
              />
            </label>
          )}
        </div>
        {fx && (
          <div className="scenario-preview" aria-live="polite">
            <small>{tr("Payment equivalent")}</small>
            <strong>
              {Number(amount) > 0 && Number(rate) > 0 ? eur(Number(amount) * Number(rate)) : '—'}
            </strong>
            <p> {tr("CHF payable × assumed EUR per CHF. A higher rate makes the same CHF bill more expensive.")} </p>
            {lastRate && (
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setRate(lastRate.rate)}
              > {tr("Use last booked rate ·")} {lastRate.rate} ({lastRate.day})
              </button>
            )}
          </div>
        )}
        {(kind === 'capex' || kind === 'money_market') && (
          <div className="scenario-preview">
            <small>{kind === 'capex' ? tr("Financing requested") : tr("Proposed placement")}</small>
            <strong>{Number(amount) > 0 ? eur(amount) : '—'}</strong>
            <p>
              {kind === 'capex'
                ? tr("Prepare a simulated lender enquiry for equipment on the selected date.")
                : tr("Free cash limit for this forecast:") + ' ' +
                  (suggested ? eur(suggested) : tr("run the investment agent first")) +
                  '.'}
            </p>
          </div>
        )}
        <button className="btn btn-primary" formNoValidate={blocked} disabled={busy}>
          {kind === 'capex' && <BriefcaseBusiness size={16} aria-hidden="true" />}
          {kind === 'money_market' && <Coins size={16} aria-hidden="true" />}
          {labels[kind]}
        </button>
      </form>
      {confirm && (
        <ApprovalModal
          title={title}
          blockedMessage={
            needsAssessment
              ? tr("Run the investment assessment to calculate the free cash available for this enquiry.")
              : noSurplus
                ? tr("This forecast has no cash available for a fund placement. Review the forecast inputs in Liquidity Agent before requesting a placement.")
                : ''
          }
          onAssess={
            needsAssessment
              ? async () => {
                  if (await submit('agents/investment')) setConfirm(false);
                }
              : undefined
          }
          description={
            amount + ' ' + unit + ' ' + tr("on") + ' ' + date + (fx ? ' ' + tr("at") + ' ' + rate + ' ' + tr("EUR per CHF.") : '.')
          }
          onApprove={approve}
          onCancel={() => setConfirm(false)}
          busy={busy}
          confirmLabel={tr("Approve simulation")}
        />
      )}
      {records.length > 0 && (
        <table className="table section">
          <caption>{tr("Approved simulations for this forecast")}</caption>
          <thead>
            <tr>
              <th>{tr("Record")}</th>
              <th>{tr("Effective date")}</th>
              <th>{tr("Amount (")}{unit})</th>
              {fx && <th>{tr("Estimated payment")}</th>}
            </tr>
          </thead>
          <tbody>
            {records.map((s) => (
              <tr key={s.id}>
                <td>
                  <span className="badge badge-sim">{tr("Simulated #")}{s.id}</span>
                </td>
                <td>{s.basis.effective_on}</td>
                <td>
                  {s.basis.amount} {unit}
                </td>
                {fx && (
                  <td>
                    {eur(s.basis.estimated_eur)} {tr("at")} {s.basis.eur_per_chf} EUR/CHF
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
