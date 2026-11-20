import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { eur } from '../lib/api';
import BalanceChart from './BalanceChart';
import RecommendationCard from './RecommendationCard';

function Inputs() {
  const { state, busy, submit, setError } = useApp();
  const [settings, setSettings] = useState(state.settings);
  const [files, setFiles] = useState({});
  const [remove, setRemove] = useState(false);
  const fields = [
    ['Cut-off date', 'as_of', 'date'],
    ['Opening balance before first booking (€)', 'starting_balance', 'number'],
    ['Safety reserve (€)', 'reserve', 'number'],
    ['Forecast days', 'horizon_days', 'number'],
  ];
  async function run(e) {
    e.preventDefault();
    try {
      const payload = { settings };
      for (const [k, file] of Object.entries(files)) {
        if (file) payload[k] = await file.text();
      }
      if (remove) payload.invoices = '';
      await submit('forecast', payload);
    } catch (error) {
      setError(error.message);
    }
  }
  return (
    <form className="card mb-4" onSubmit={run}>
      <div className="card-title">Forecast settings</div>
      <div className="card-sub">
        Opening balance is an assumption. Only payments booked and valued by the cut-off enter the
        forecast.
      </div>
      <div className="controls">
        {fields.map(([label, key, type]) => (
          <label key={key}>
            {label}
            <input
              type={type}
              required
              step={key === 'horizon_days' ? 1 : type === 'number' ? '.01' : undefined}
              min={key === 'reserve' ? 0 : key === 'horizon_days' ? 1 : undefined}
              max={key === 'horizon_days' ? 366 : undefined}
              value={settings[key]}
              onChange={(e) => setSettings({ ...settings, [key]: e.target.value })}
            />
          </label>
        ))}
      </div>
      <details className="section">
        <summary>Import CSV files</summary>
        <p>
          Keep a field empty to reuse its current file. The initial workspace uses the Pizzeria
          Amalfi sample.
        </p>
        <div className="controls">
          {[
            ['statement', 'Bank statement'],
            ['plan', 'Cash flow plan'],
            ['invoices', 'Invoices'],
          ].map(([k, label]) => (
            <label key={k}>
              {label}
              <input
                type="file"
                accept=".csv,text/csv"
                disabled={k === 'invoices' && remove}
                onChange={(e) => setFiles({ ...files, [k]: e.target.files[0] })}
              />
            </label>
          ))}
        </div>
        {state.has_invoices && (
          <label>
            <input type="checkbox" checked={remove} onChange={(e) => setRemove(e.target.checked)} />{' '}
            Remove imported invoices
          </label>
        )}
        <p>
          Plan: date,category,amount_eur,description (optional invoice_id). Invoices:
          invoice_id;counterparty;issued_on;due_on;amount_eur. Use ISO dates and signed EUR amounts.
        </p>
      </details>
      <button className="btn btn-primary" disabled={busy}>
        {busy ? 'Working…' : 'Run forecast'}
      </button>
    </form>
  );
}

export default function LiquidityAgent() {
  const { state } = useApp();
  const a = state.analysis,
    f = a.forecast;
  return (
    <>
      <Inputs key={state.revision} />
      <div className="grid-2">
        <section className="card">
          <div className="card-title">Forecast · {state.settings.horizon_days} days</div>
          <p className="card-sub">
            Daily closing balance in EUR. Reserve {eur(f.reserve)}. Minimum {eur(f.minimum_balance)}{' '}
            on {f.minimum_on}.
          </p>
          <BalanceChart
            points={[{ day: f.as_of, balance: f.opening_balance }, ...f.daily_balances]}
            reserve={f.reserve}
          />
        </section>
        <section className="card">
          <div className="card-title">Liquidity decision</div>
          <RecommendationCard role="liquidity" />
        </section>
      </div>
      <section className="card mb-4">
        <div className="card-title">Payments at risk</div>
        {a.payments_at_risk.length ? (
          a.payments_at_risk.map((p, i) => (
            <p key={i}>
              {p.date} · {p.description} · {eur(p.amount_eur)}
            </p>
          ))
        ) : (
          <p>No payments below the reserve.</p>
        )}
        {f.drivers.length > 0 && (
          <details className="section">
            <summary>Payments driving the shortfall</summary>
            {f.drivers.map((d, i) => (
              <p key={i}>
                {d.date} · {d.description} · {eur(d.amount_eur)}
              </p>
            ))}
          </details>
        )}
        {a.receipt_delays.map((p) => (
          <p key={p.invoice_id}>
            Receipt {p.invoice_id} · Due {p.due_on} · Expected {p.expected_on} · {eur(p.amount_eur)}
          </p>
        ))}
      </section>
      <section className="card">
        <div className="card-title">Planned payments and income</div>
        <table className="table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Description</th>
              <th>Category</th>
              <th>Amount</th>
            </tr>
          </thead>
          <tbody>
            {a.plan.map((p, i) => (
              <tr key={i}>
                <td>{p.date}</td>
                <td>{p.description}</td>
                <td>{p.category}</td>
                <td>{eur(p.amount_eur)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  );
}
