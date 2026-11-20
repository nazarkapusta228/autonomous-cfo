import React from 'react';
import { LayoutDashboard, Droplets, Coins, Receipt, TrendingUp, ListOrdered } from 'lucide-react';

const NAV = [
  { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { key: 'liquidity', label: 'Liquidity Agent', icon: Droplets },
  { key: 'fx', label: 'Currency Exposure', icon: Coins },
  { key: 'tax', label: 'Tax Payments', icon: Receipt },
  { key: 'investment', label: 'Investment Agent', icon: TrendingUp },
  { key: 'transactions', label: 'Transactions', icon: ListOrdered },
];

export default function Sidebar({ active, onNavigate }) {
  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <h1>
          <span
            style={{
              width: 10,
              height: 10,
              borderRadius: 3,
              background: 'var(--primary)',
              display: 'inline-block',
            }}
          />
          Autonomous CFO
        </h1>
        <p>Commerzbank · RedHat Collabothon 2026</p>
      </div>
      <nav className="sidebar-nav">
        {NAV.map((n) => {
          const Icon = n.icon;
          return (
            <button
              key={n.key}
              className={`nav-item ${active === n.key ? 'active' : ''}`}
              aria-current={active === n.key ? 'page' : undefined}
              onClick={() => onNavigate(n.key)}
            >
              <Icon size={20} aria-hidden="true" />
              {n.label}
            </button>
          );
        })}
      </nav>
      <div className="sidebar-footer">
        <div style={{ marginBottom: 6 }}>OpenShift AI · Qwen2.5-7B-Instruct</div>
        <div className="mono">v1.0.0-hackathon</div>
      </div>
    </aside>
  );
}
