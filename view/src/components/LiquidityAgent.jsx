import React, { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { eur } from '../lib/forecast';
import { DEMO } from '../lib/demo';
import RecommendationCard from './RecommendationCard';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, CartesianGrid } from 'recharts';

export default function LiquidityAgent() {
  const { forecast: fc, rec, setRec, loading, error, run } = useApp();
  const [asOf, setAsOf] = useState(DEMO.asOf);
  const [reserve, setReserve] = useState(0);

  const data = useMemo(() => fc && [
    { date: fc.asOf, balance: fc.openingCents / 100 },            // last known (history) point
    ...fc.points.map((p) => ({ date: p.date, balance: p.balance / 100 })),
  ], [fc]);

  const onRun = () => run({ asOf, reserveCents: Math.round(Number(reserve || 0) * 100) });

  return (
    <div>
      <div className="card mb-4">
        <div className="card-title">Forecast settings</div>
        <div className="card-sub">Planned amounts after the cut-off date are assumptions, not bank data.</div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <label className="text-muted">Cut-off date <input type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} /></label>
          <label className="text-muted">Safety reserve (€) <input type="number" min="0" step="100" value={reserve} onChange={(e) => setReserve(e.target.value)} style={{ width: 110 }} /></label>
          <button className="btn btn-primary" onClick={onRun} disabled={loading}>{loading ? 'Calculating…' : 'Run forecast'}</button>
        </div>
        {error && <p className="amount-neg" role="alert" style={{ marginTop: 12 }}>{error} <button className="btn btn-ghost" onClick={onRun}>Try again</button></p>}
      </div>

      {!fc && !error && <div className="card">Loading demo scenario…</div>}

      {fc && (
        <div className="grid-2 mb-4">
          <div className="card">
            <div className="card-title">Cash flow forecast · 45 days</div>
            <div className="card-sub">Opening balance {eur(fc.openingCents)} on {fc.asOf}. Left of the line: bank history. Right: forecast.</div>
            <div className="chart-wrap">
              <ResponsiveContainer>
                <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <defs><linearGradient id="balGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#ffcc00" stopOpacity={0.35} /><stop offset="100%" stopColor="#ffcc00" stopOpacity={0} /></linearGradient></defs>
                  <CartesianGrid stroke="#24305a" strokeDasharray="3 3" />
                  <XAxis dataKey="date" tick={{ fill: '#8a96c0', fontSize: 11 }} tickFormatter={(d) => d.slice(5)} minTickGap={24} />
                  <YAxis tick={{ fill: '#8a96c0', fontSize: 11 }} tickFormatter={(v) => `€${(v / 1000).toFixed(1)}k`} />
                  <Tooltip contentStyle={{ background: '#172042', border: '1px solid #24305a', borderRadius: 8 }} formatter={(v) => [eur(Math.round(v * 100)), 'Balance']} />
                  <ReferenceLine y={0} stroke="#ff6b6b" strokeDasharray="4 4" />
                  <ReferenceLine x={fc.asOf} stroke="#8a96c0" label={{ value: 'Cut-off', fill: '#8a96c0', fontSize: 11 }} />
                  {fc.firstNegative && <ReferenceLine x={fc.firstNegative} stroke="#ff6b6b" label={{ value: 'First deficit', fill: '#ff6b6b', fontSize: 11 }} />}
                  <Area type="monotone" dataKey="balance" stroke="#ffcc00" strokeWidth={2} fill="url(#balGrad)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="card">
            <div className="card-title">What the agent found</div>
            <div className="card-sub">Analysis and recommendation are automatic. Your approval is required.</div>
            {rec ? <RecommendationCard rec={rec} forecast={fc} onChange={setRec} /> : <p className="text-muted">Preparing recommendation…</p>}
          </div>
        </div>
      )}

      {fc && (
        <div className="card mb-4">
          <div className="card-title">Planned payments and income</div>
          <div className="card-sub">Lowest balance {eur(fc.minBalance)} on {fc.minDate}</div>
          <table className="table">
            <thead><tr><th>Date</th><th>Income</th><th>Payments</th><th>Balance after</th></tr></thead>
            <tbody>
              {fc.points.filter((p) => p.inflow || p.outflow).map((p) => (
                <tr key={p.date}>
                  <td className="mono">{p.date}</td>
                  <td className="amount-pos">{p.inflow ? eur(p.inflow) : ''}</td>
                  <td className="amount-neg">{p.outflow ? eur(p.outflow) : ''}</td>
                  <td className={p.balance < 0 ? 'amount-neg' : ''}>{eur(p.balance)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
