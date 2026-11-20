import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { eur, nextDay } from '../lib/api';
import ApprovalModal from './ApprovalModal';

export default function SimulationForm({
  kind,
  title,
  description,
  suggested = '',
  disabled = false,
}) {
  const { state, busy, submit } = useApp();
  const [amount, setAmount] = useState(suggested);
  const [date, setDate] = useState(nextDay(state.settings.as_of));
  const [rate, setRate] = useState('');
  const [confirm, setConfirm] = useState(false);
  const fx = kind === 'fx_forward';
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
          <label>
            Effective date
            <input
              type="date"
              required
              min={nextDay(state.settings.as_of)}
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </label>
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
        <button className="btn btn-primary" disabled={busy || disabled}>
          Review simulation
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
      {records.map((s) => (
        <p className="section" key={s.id}>
          Simulated #{s.id} · {s.basis.effective_on} · {s.basis.amount} {unit}
          {s.basis.estimated_eur &&
            ' · ' + eur(s.basis.estimated_eur) + ' at ' + s.basis.eur_per_chf + ' EUR/CHF'}
        </p>
      ))}
    </section>
  );
}
