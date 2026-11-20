import React, { useState, useMemo } from 'react';
import { transactions } from '../data/transactions';

export default function Transactions() {
  const [typeFilter, setTypeFilter] = useState('ALL');
  const [search, setSearch] = useState('');

  const types = useMemo(() => ['ALL', ...new Set(transactions.map(t => t.type))], []);

  const filtered = useMemo(() => {
    return transactions.filter(t => {
      const typeOk = typeFilter === 'ALL' || t.type === typeFilter;
      const q = search.toLowerCase();
      const searchOk = !q || t.ref.toLowerCase().includes(q) || t.counterparty.toLowerCase().includes(q);
      return typeOk && searchOk;
    });
  }, [typeFilter, search]);

  return (
    <div>
      <div className="card mb-4">
        <div className="card-title">Filter Transactions</div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 8 }}>
          <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
            {types.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <input
            placeholder="Search reference or counterparty..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{
              flex: 1, minWidth: 220, padding: '8px 12px',
              background: 'var(--bg-elev)', border: '1px solid var(--border)',
              borderRadius: 8, color: 'var(--text)', fontSize: 13
            }}
          />
        </div>
      </div>

      <div className="card">
        <div className="card-title">
          Account Activity ({filtered.length})
          <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 400 }}>
            Account DE8937...3000 · EUR
          </span>
        </div>
        <table className="table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Type</th>
              <th>Reference</th>
              <th>Counterparty</th>
              <th style={{ textAlign: 'right' }}>Amount</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((t, i) => (
              <tr key={i}>
                <td className="mono">{t.date}</td>
                <td><span className="badge badge-sim">{t.type}</span></td>
                <td>{t.ref}</td>
                <td>{t.counterparty}</td>
                <td style={{ textAlign: 'right' }} className={t.amount >= 0 ? 'amount-pos' : 'amount-neg'}>
                  {t.amount >= 0 ? '+' : ''}{t.amount.toLocaleString('de-DE', { minimumFractionDigits: 2 })} {t.currency}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}