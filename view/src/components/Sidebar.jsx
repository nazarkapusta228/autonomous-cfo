import { usePreferences } from '../context/Preferences';
import React from 'react';
import { SlidersHorizontal, Database, Settings, LayoutDashboard, Droplets, Coins, Receipt, TrendingUp, ListOrdered } from 'lucide-react';

const NAV = [
  { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { key: 'liquidity', label: 'Liquidity Agent', icon: Droplets },
  { key: 'fx', label: 'Currency Exposure', icon: Coins },
  { key: 'tax', label: 'Tax Payments', icon: Receipt },
  { key: 'investment', label: 'Investment Agent', icon: TrendingUp },
  { key: 'transactions', label: 'Transactions', icon: ListOrdered },
  { key:'scenarios',label:'Simulations',icon:SlidersHorizontal },
  { key: 'data', label: 'Data', icon: Database },
  { key: 'settings', label: 'Settings', icon: Settings },
];

export default function Sidebar({ active, onNavigate }) {
  const { t: tr } = usePreferences();
  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <h1>Autonomous CFO</h1>
        <p>RedHat Collabothon 2026</p>
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
              {tr(n.label)}
            </button>
          );
        })}
      </nav>

    </aside>
  );
}
