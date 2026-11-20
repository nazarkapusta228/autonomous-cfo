import React from 'react';
import { useApp } from '../context/AppContext';
import { eur } from '../lib/forecast';
import RecommendationCard from './RecommendationCard';

const TIERS = [['Analyse', 'Automatic'], ['Recommend', 'Automatic · explained'], ['Approve', 'You decide'], ['Execute', 'Simulated']];

export default function Dashboard() {
  const { forecast: fc, rec, setRec, loading, error, run, health } = useApp();
  if (error) return <div className="card"><p className="amount-neg" role="alert">{error}</p><button className="btn btn-primary" onClick={() => run()}>Try again</button></div>;
  if (!fc) return <div className="card">{loading ? 'Calculating forecast…' : 'No forecast yet.'}</div>;
  const risky = fc.fundingNeeded > 0;

  return (
    <div>
      <div className="kpi-grid">
        <div className="kpi"><div className="kpi-label">Balance on {fc.asOf}</div><div className="kpi-value">{eur(fc.openingCents)}</div></div>
        <div className="kpi"><div className="kpi-label">Lowest balance (45d)</div><div className="kpi-value" style={{ color: fc.minBalance < 0 ? 'var(--danger)' : 'var(--success)' }}>{eur(fc.minBalance)}</div><div className="kpi-delta text-muted">on {fc.minDate}</div></div>
        <div className="kpi"><div className="kpi-label">Cash runs out</div><div className="kpi-value">{fc.firstNegative ?? 'Not in 45 days'}</div></div>
        <div className="kpi"><div className="kpi-label">Funding needed</div><div className={`kpi-value`} style={{ color: risky ? 'var(--warning)' : 'var(--success)' }}>{eur(fc.fundingNeeded)}</div></div>
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="card-title">Your decision</div>
          <div className="card-sub">One problem, one proposal. Nothing happens without you.</div>
          {rec ? <RecommendationCard rec={rec} forecast={fc} onChange={setRec} /> : <p className="text-muted">Preparing recommendation…</p>}
        </div>
        <div className="card">
          <div className="card-title">What the agent may do</div>
          <div className="tier-row" style={{ gridTemplateColumns: '1fr 1fr' }}>
            {TIERS.map(([l, v]) => <div className="tier" key={l}><div className="tier-label">{l}</div><div className="tier-value">{v}</div></div>)}
          </div>
          <div className="card-sub" style={{ marginTop: 16 }}>System</div>
          {['app', 'db', 'model'].map((k) => (
            <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid rgba(36,48,90,.5)', fontSize: 12.5 }}>
              <span className="text-muted">{k}</span>
              <span style={{ color: health?.[k] ? 'var(--success)' : 'var(--danger)', fontWeight: 600 }}>● {health?.[k] ?? 'unreachable'}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
