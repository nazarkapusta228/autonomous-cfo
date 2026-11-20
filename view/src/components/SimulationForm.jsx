import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { eur, nextDay } from '../lib/api';
import { BriefcaseBusiness, Coins } from 'lucide-react';
import DateField from './DateField';
import ApprovalModal from './ApprovalModal';

export default function SimulationForm({
  kind,
  title,
  description,
  suggested = '',
  disabled = false,
  suggestedDate,
}) {
  const { state, busy, submit } = useApp();
  const [amount, setAmount] = useState(suggested);
  const [date, setDate] = useState(suggestedDate || nextDay(state.settings.as_of));
  const [rate, setRate] = useState('');
  const [confirm, setConfirm] = useState(false);
  const fx = kind === 'fx_forward';
  const labels = {
    fx_forward: 'Review CHF forward',
    money_market: 'Review fund enquiry',
    capex: 'Review equipment financing',
    tax_prepayment: 'Review tax prepayment',
  };
  const lastRate = state.fx.rates.at(-1);
  const unit = fx ? 'CHF' : 'EUR';
  const records = state.simulations.filter((s) => s.kind === kind);
  async function approve() {
    const fields = { kind, amount, effective_on: date };
    if (fx) fields.eur_per_chf = rate;
    await submit('simulations', fields);
    setConfirm(false);
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
          <label>
            Scenario amount ({unit})
            <input
              type="number"
              step=".01"
              min=".01"
              required
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </label>
          <DateField
            label="Effective date"
            value={date}
            onChange={setDate}
            min={nextDay(state.settings.as_of)}
            shortcuts={[
              ['Next day', nextDay(state.settings.as_of)],
              ['Forecast end', state.analysis.forecast.daily_balances.at(-1).day],
            ]}
          />
          {fx && (
            <label>
              Assumed EUR per CHF
              <input
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
            <small>Future payment in EUR</small>
            <strong>
              {Number(amount) > 0 && Number(rate) > 0 ? eur(Number(amount) * Number(rate)) : '—'}
            </strong>
            <p>
              CHF payable × assumed EUR per CHF. A higher rate makes the same CHF bill more
              expensive.
            </p>
            {lastRate && (
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setRate(lastRate.rate)}
              >
                Use last booked rate · {lastRate.rate} ({lastRate.day})
              </button>
            )}
          </div>
        )}
        {(kind === 'capex' || kind === 'money_market') && (
          <div className="scenario-preview">
            <small>{kind === 'capex' ? 'Financing requested' : 'Proposed placement'}</small>
            <strong>{Number(amount) > 0 ? eur(amount) : '—'}</strong>
            <p>
              {kind === 'capex'
                ? 'Prepare a simulated lender enquiry for equipment on the selected date.'
                : 'Free cash limit for this forecast: ' +
                  (suggested ? eur(suggested) : 'run the investment agent first') +
                  '.'}
            </p>
          </div>
        )}
        <button className="btn btn-primary" disabled={busy || disabled}>
          {kind === 'capex' && <BriefcaseBusiness size={16} aria-hidden="true" />}
          {kind === 'money_market' && <Coins size={16} aria-hidden="true" />}
          {labels[kind]}
        </button>
      </form>
      {confirm && (
        <ApprovalModal
          title={title}
          description={
            amount + ' ' + unit + ' on ' + date + (fx ? ' at ' + rate + ' EUR per CHF.' : '.')
          }
          onApprove={approve}
          onCancel={() => setConfirm(false)}
          busy={busy}
          confirmLabel="Approve simulation"
        />
      )}
      {records.length > 0 && (
        <table className="table section">
          <caption>Approved simulations for this forecast</caption>
          <thead>
            <tr>
              <th>Record</th>
              <th>Effective date</th>
              <th>Amount ({unit})</th>
              {fx && <th>Estimated EUR at assumed rate</th>}
            </tr>
          </thead>
          <tbody>
            {records.map((s) => (
              <tr key={s.id}>
                <td>
                  <span className="badge badge-sim">Simulated #{s.id}</span>
                </td>
                <td>{s.basis.effective_on}</td>
                <td>
                  {s.basis.amount} {unit}
                </td>
                {fx && (
                  <td>
                    {eur(s.basis.estimated_eur)} at {s.basis.eur_per_chf} EUR/CHF
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
