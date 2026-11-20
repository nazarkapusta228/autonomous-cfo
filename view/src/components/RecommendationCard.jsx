import React, { useState } from 'react';
import { api } from '../lib/api';
import { eur } from '../lib/forecast';

// Owner sees 3 things at once: WHEN money runs out, HOW MUCH is needed, WHY. Then decides.
export default function RecommendationCard({ rec, forecast, onChange }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const stale = rec.forecastId !== forecast.id; // inputs changed -> this decision no longer applies

  const decide = async (kind) => {
    if (busy) return;               // blocks double click
    setBusy(true); setError(null);
    try { onChange(await api[kind](rec.id)); }
    catch { setError('Could not save your decision. Nothing was changed — try again.'); }
    finally { setBusy(false); }
  };

  if (rec.action === 'hold') return <div className="rec-block"><h4>No action needed</h4><p>{rec.explanation}</p></div>;

  return (
    <div className="rec-block" aria-busy={busy}>
      <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)', marginBottom: 12 }}>
        <div className="kpi"><div className="kpi-label">Cash runs out</div><div className="kpi-value" style={{ fontSize: 20 }}>{forecast.firstNegative ?? '—'}</div></div>
        <div className="kpi"><div className="kpi-label">You need</div><div className="kpi-value" style={{ fontSize: 20 }}>{eur(rec.amount)}</div></div>
        <div className="kpi"><div className="kpi-label">Needed by</div><div className="kpi-value" style={{ fontSize: 20 }}>{rec.neededBy}</div></div>
      </div>
      <h4>Why</h4>
      <p>{rec.explanation}</p>
      <ul>{forecast.drivers.map((d) => <li key={d.date + d.label}>{d.date} · {d.label} · {eur(d.cents)}</li>)}</ul>
      {rec.risks.length > 0 && <p style={{ marginTop: 8, color: 'var(--text-muted)' }}>Risks: {rec.risks.join(' · ')}</p>}

      {stale && <p className="amount-neg" role="alert">Inputs changed. Generate a new recommendation to decide.</p>}
      {error && <p className="amount-neg" role="alert">{error}</p>}

      {rec.status === 'pending' && !stale && (
        <div className="modal-actions">
          <button className="btn btn-ghost" disabled={busy} onClick={() => decide('reject')}>Reject</button>
          <button className="btn btn-primary" disabled={busy} onClick={() => decide('approve')}>{busy ? 'Saving…' : 'Approve (simulation)'}</button>
        </div>
      )}
      {rec.status === 'approved' && <p className="badge badge-approved">Approved · simulated request {rec.simulation?.requestNo}</p>}
      {rec.status === 'rejected' && <p className="badge badge-sell">Rejected · saved to audit log</p>}
    </div>
  );
}
