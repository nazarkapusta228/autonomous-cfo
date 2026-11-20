import React from 'react';
import { useApp } from '../context/AppContext';
import { eur } from '../lib/api';
import BalanceChart from './BalanceChart';

export default function Dashboard() {
  const { state } = useApp();
  const fc = state.analysis.forecast;
  const metrics = [
    [
      'Balance on ' + fc.as_of,
      eur(fc.opening_balance),
      'Starting cash plus booked movements through the cut-off.',
      Number(fc.opening_balance) < 0,
    ],
    [
      'Lowest balance · ' + state.settings.horizon_days + ' days',
      eur(fc.minimum_balance),
      'Lowest forecast close, on ' + fc.minimum_on + '.',
      Number(fc.minimum_balance) < 0,
    ],
    [
      'First deficit',
      fc.first_deficit_on || 'None in horizon',
      'First forecast day that closes below zero.',
      false,
    ],
    [
      'Funding needed',
      eur(fc.funding_needed),
      'Cash needed to keep the balance at or above the reserve.',
      false,
    ],
  ];
  return (
    <>
      <div className="kpi-grid">
        {metrics.map(([k, v, hint, attention]) => (
          <div className="kpi" key={k}>
            <div className="kpi-label">{k}</div>
            <div className={attention ? 'kpi-value amount-neg' : 'kpi-value'}>{v}</div>
            <p className="metric-hint">{hint}</p>
          </div>
        ))}
      </div>
      <section className="card mb-4">
        <div className="card-title">Cash balance forecast</div>
        <p className="card-sub">
          Starting at the cut-off balance, each day adds expected receipts and subtracts planned
          payments. The dashed line marks your safety reserve.
        </p>
        <BalanceChart
          neutral
          points={[{ day: fc.as_of, balance: fc.opening_balance }, ...fc.daily_balances]}
          reserve={fc.reserve}
        />
      </section>
      <section className="card">
        <div className="card-title">Workspace audit</div>
        <p className="card-sub">
          Agent runs, decisions and simulations recorded in this workspace, with their reference
          numbers.
        </p>
        {state.audit.length ? (
          <table className="table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Workflow</th>
                <th>Event</th>
                <th>Record</th>
              </tr>
            </thead>
            <tbody>
              {state.audit.map((e, i) => (
                <tr key={i}>
                  <td>{new Date(e.occurred_at).toLocaleString()}</td>
                  <td>{e.kind}</td>
                  <td>
                    <span className="badge badge-sim">{e.event}</span>
                  </td>
                  <td>#{e.number}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-muted">No activity recorded yet.</p>
        )}
      </section>
    </>
  );
}
