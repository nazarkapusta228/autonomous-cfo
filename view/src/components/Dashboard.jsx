import React from 'react';
import { useApp } from '../context/AppContext';
import { eur } from '../lib/api';
import RecommendationCard from './RecommendationCard';

export default function Dashboard() {
  const { state, health, refreshHealth } = useApp();
  const fc = state.analysis.forecast;
  const metrics = [
    ['Balance on ' + fc.as_of, eur(fc.opening_balance)],
    ['Lowest balance · ' + state.settings.horizon_days + ' days', eur(fc.minimum_balance)],
    ['First deficit', fc.first_deficit_on || 'None in horizon'],
    ['Funding needed', eur(fc.funding_needed)],
  ];
  return (
    <>
      <div className="kpi-grid">
        {metrics.map(([k, v]) => (
          <div className="kpi" key={k}>
            <div className="kpi-label">{k}</div>
            <div className="kpi-value">{v}</div>
          </div>
        ))}
      </div>
      <div className="grid-2">
        <section className="card">
          <div className="card-title">Liquidity decision</div>
          <RecommendationCard role="liquidity" />
        </section>
        <section className="card">
          <div className="card-title">System health</div>
          {['app', 'db', 'model'].map((k) => (
            <p className="health" key={k}>
              {k === 'model' ? 'Qwen' : k === 'db' ? 'PostgreSQL' : 'FastAPI'}
              <strong className={health[k] === 'ready' ? 'amount-pos' : 'text-muted'}>
                {health[k] || 'Checking…'}
              </strong>
            </p>
          ))}
          <button className="btn btn-ghost" onClick={refreshHealth}>
            Refresh health
          </button>
        </section>
      </div>
      <section className="card">
        <div className="card-title">Workspace audit</div>
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
                  <td>{e.event}</td>
                  <td>#{e.number}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-muted">Your agent runs, decisions and simulations will appear here.</p>
        )}
      </section>
    </>
  );
}
