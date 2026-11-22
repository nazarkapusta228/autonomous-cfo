import { usePreferences } from '../context/Preferences';
import React, { useEffect, useState } from 'react';
import AssistantChat from './AssistantChat';
import {
  Database,
  Settings,
  LayoutDashboard,
  Rocket,
  ListOrdered,
} from 'lucide-react';

const NAV = [
  { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { key: 'liquidity', label: 'Liquidity Agent', icon: Rocket },
  { key: 'transactions', label: 'Transactions', icon: ListOrdered },
  { key: 'data', label: 'Data', icon: Database },
  { key: 'settings', label: 'Settings', icon: Settings },
];

export default function Sidebar({ active, onNavigate }) {
  const { t: tr } = usePreferences();
  const [expanded, setExpanded] = useState(false);
  useEffect(() => {
    const collapse = (event) => {
      if (event.target.closest?.('main, .content')) setExpanded(false);
    };
    document.addEventListener('pointerdown', collapse);
    return () => document.removeEventListener('pointerdown', collapse);
  }, []);
  function navItem(n) {
          const Icon = n.icon;
          return (
            <button
              key={n.key} data-tour={n.key}
              className={`nav-item ${active === n.key ? 'active' : ''}`}
              aria-current={active === n.key ? 'page' : undefined}
              onClick={() => {
                setExpanded(false);
                onNavigate(n.key);
              }}
            >
              <Icon size={20} aria-hidden="true" />
              {tr(n.label)}
            </button>
          );
  }
  return (
    <aside
      className={'sidebar with-assistant' + (expanded ? ' chat-open' : '')}
    >
      <div className="sidebar-brand">
        <img src="/cfo-mark.png" alt="" width="46" height="46" />
        <div>
          <h1>Autonomous CFO</h1>
          <p>RedHat Collabothon 2026</p>
        </div>
      </div>
      <nav className="sidebar-nav">
        {NAV.filter(n => n.key !== 'settings').map(navItem)}
      </nav>
      <AssistantChat expanded={expanded} expand={() => setExpanded(true)} />
      <nav className="sidebar-nav sidebar-settings">
        {navItem(NAV.find(n => n.key === 'settings'))}
      </nav>
    </aside>
  );
}
