import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { availableForInvestment, currentBalance, projectedLowestBalance } from '../utils/analytics';
import ApprovalModal from './ApprovalModal';
import { PiggyBank, TrendingUp, Landmark, Building2 } from 'lucide-react';

const PRODUCTS = [
  {
    id: 'fixed-deposit',
    name: 'Commerzbank Fixed-Term Deposit',
    rate: 2.35,
    term: '14 days',
    min: 1000,
    risk: 'Very low',
    icon: Landmark,
    desc: 'Secure the best rate for a short window. Auto-rolls if not withdrawn. Ideal for known upcoming obligations within a 2-week horizon.'
  },
  {
    id: 'money-market',
    name: 'Money Market Fund (EUR)',
    rate: 2.10,
    term: 'Daily liquidity',
    min: 500,
    risk: 'Low',
    icon: TrendingUp,
    desc: 'Slightly lower yield but fully liquid — you can access funds same day. Good buffer for unpredictable cash needs.'
  },
  {
    id: 'capex',
    name: 'Capex Financing (Commerzbank SME)',
    rate: 3.45,
    term: '36 months',
    min: 5000,
    risk: 'Medium',
    icon: Building2,
    desc: 'Finance the new pizza oven upgrade. Asset-backed, tax-efficient, spreads cost over 3 years.'
  }
];

export default function InvestmentAgent() {
  const invest = availableForInvestment();
  const balance = currentBalance();
  const lowest = projectedLowestBalance(45);
  const [selected, setSelected] = useState(null);
  const { logAction, showToast } = useApp();

  const handleApprove = () => {
    if (!selected) return;
    logAction({
      agent: 'Investment',
      type: 'INVESTMENT_PLACED',
      detail: `${selected.name} · €${invest.toLocaleString()} @ ${selected.rate}% p.a.`,
      status: 'APPROVED'
    });
    showToast(`✓ €${invest.toLocaleString()} allocated to ${selected.name} (simulation)`);
    setSelected(null);
  };

  return (
    <div>
      <div className="kpi-grid">
        <div className="kpi">
          <div className="kpi-label">Current Balance</div>
          <div className="kpi-value">€ {balance.toLocaleString('de-DE', { minimumFractionDigits: 2 })}</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Projected Lowest (45d)</div>
          <div className="kpi-value" style={{ color: 'var(--warning)' }}>€ {lowest.toLocaleString('de-DE', { minimumFractionDigits: 2 })}</div>
        </div>
        <div className="kpi" style={{ borderColor: 'var(--primary)' }}>
          <div className="kpi-label">Available to Invest</div>
          <div className="kpi-value" style={{ color: 'var(--primary)' }}>€ {invest.toLocaleString('de-DE')}</div>
          <div className="kpi-delta up">After 45-day obligation buffer</div>
        </div>
      </div>

      <div className="card mb-4">
        <div className="card-title">Agent Recommendation</div>
        <div className="card-sub">Idle liquidity can be deployed without risking liquidity</div>
        <div className="rec-block">
          <h4><PiggyBank size={14} style={{ marginRight: 6, verticalAlign: -2 }} /> Recommended deployment</h4>
          <p>
            Based on your 45-day cash flow projection, <strong>€{invest.toLocaleString()}</strong> can be safely
            allocated without breaching the safety buffer. The highest yielding short-term product is the
            <strong> 14-day Commerzbank fixed-term deposit at 2.35% p.a.</strong>, yielding approximately
            <strong> €{((invest * 0.0235 * 14) / 365).toFixed(2)}</strong> over the term with essentially no risk.
          </p>
          <p style={{ marginTop: 8 }}>
            If you anticipate a capex (e.g. the planned pizza oven upgrade), the 36-month capex financing
            at 3.45% is an alternative that preserves cash flow rather than locking it up.
          </p>
        </div>
      </div>

      <div className="card">
        <div className="card-title">Investment Products</div>
        <div className="card-sub">Evaluated against liquidity profile</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14, marginTop: 8 }}>
          {PRODUCTS.map(p => {
            const Icon = p.icon;
            return (
              <div className="agent-card" key={p.id}>
                <div className="agent-icon"><Icon size={18} /></div>
                <div className="agent-name">{p.name}</div>
                <div className="agent-desc">{p.desc}</div>
                <div className="agent-meta" style={{ marginBottom: 12 }}>
                  <span>Yield: <strong style={{ color: 'var(--success)' }}>{p.rate}%</strong></span>
                  <span>Term: {p.term}</span>
                </div>
                <div className="agent-meta" style={{ marginBottom: 12 }}>
                  <span>Min: €{p.min.toLocaleString()}</span>
                  <span>Risk: {p.risk}</span>
                </div>
                <button
                  className="btn btn-primary"
                  style={{ width: '100%', justifyContent: 'center' }}
                  disabled={invest < p.min}
                  onClick={() => setSelected(p)}
                >
                  {invest < p.min ? 'Insufficient idle cash' : `Allocate €${invest.toLocaleString()}`}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {selected && (
        <ApprovalModal
          title={`Approve investment: ${selected.name}`}
          description={`You are about to allocate €${invest.toLocaleString()} to ${selected.name} at ${selected.rate}% p.a. for ${selected.term}. This is a simulation — no real financial transaction will be executed.`}
          onApprove={handleApprove}
          onCancel={() => setSelected(null)}
          confirmLabel="Approve & simulate"
        />
      )}
    </div>
  );
}