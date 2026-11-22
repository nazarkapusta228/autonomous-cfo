import React, { useState } from 'react';
import { AppProvider } from './context/AppContext';
import Data from './components/Data';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import Dashboard from './components/Dashboard';
import LiquidityAgent from './components/LiquidityAgent';
import Transactions from './components/Transactions';

import {AccountGate} from './components/Account';
import Settings from './components/Settings';
import { Preferences } from './context/Preferences';
import { StatementPeriod, PeriodPicker } from './context/StatementPeriod';

const PAGES = {
  data: {title:'Data', subtitle:'Imports and exports', component:Data},
  settings: {title:'Settings', subtitle:'Workspace preferences', component:Settings},
  dashboard: {
    title: 'Financial Overview',
    subtitle: 'Cash position and outlook',
    component: Dashboard,
  },
  liquidity: {
    title: 'Liquidity Agent',
    subtitle: 'Cash flow forecasting & credit facilities',
    component: LiquidityAgent,
  },
  transactions: {
    title: 'Transactions',
    subtitle: 'All account activity',
    component: Transactions,
  },
};

import WorkspaceTour from './components/WorkspaceTour';

export default function App() {
  return <Preferences><AccountGate><AppProvider><StatementPeriod><Workspace /></StatementPeriod></AppProvider></AccountGate></Preferences>;
}

function Workspace() {
  const [active, setActive] = useState('dashboard');
  const Page = PAGES[active].component;

  return (
    <>
      <div className="app-shell">
        <Sidebar active={active} onNavigate={setActive} />
        <div className="main-area">
          <Header title={PAGES[active].title} subtitle={PAGES[active].subtitle} />
          <div key={active} className="content">
            {active === 'transactions' && <PeriodPicker />}
            <Page />
          </div>
        </div>
      </div>
      <WorkspaceTour active={active} navigate={setActive} />
    </>
  );
}
