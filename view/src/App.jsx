import React, { useState } from 'react';
import { AppProvider } from './context/AppContext';
import Simulations from './components/Simulations';
import Data from './components/Data';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import Dashboard from './components/Dashboard';
import LiquidityAgent from './components/LiquidityAgent';
import FXAgent from './components/FXAgent';
import TaxAgent from './components/TaxAgent';
import InvestmentAgent from './components/InvestmentAgent';
import Transactions from './components/Transactions';

import {AccountGate} from './components/Account';
import Settings from './components/Settings';
import { Preferences } from './context/Preferences';
import { StatementPeriod, PeriodPicker } from './context/StatementPeriod';

const PAGES = {
  scenarios: {title:'Simulations',subtitle:'Compare cash flow scenarios',component:Simulations},
  data: {title:'Data', subtitle:'Imports and exports', component:Data},
  settings: {title:'Settings', subtitle:'Workspace preferences', component:Settings},
  dashboard: {
    title: 'Financial Overview',
    subtitle: 'Cash position and approval history',
    component: Dashboard,
  },
  liquidity: {
    title: 'Liquidity Agent',
    subtitle: 'Cash flow forecasting & credit facilities',
    component: LiquidityAgent,
  },
  fx: {
    title: 'Currency Exposure',
    subtitle: 'Foreign currency payments and forward simulation',
    component: FXAgent,
  },
  tax: {
    title: 'Tax Payments',
    subtitle: 'Scheduled taxes and advance payment simulations',
    component: TaxAgent,
  },
  investment: {
    title: 'Investment Agent',
    subtitle: 'Cash available for short-term investment',
    component: InvestmentAgent,
  },
  transactions: {
    title: 'Transactions',
    subtitle: 'All account activity',
    component: Transactions,
  },
};

export default function App() {
  const [active, setActive] = useState('dashboard');
  const Page = PAGES[active].component;

  return (
    <Preferences><AccountGate><AppProvider><StatementPeriod>
      <div className="app-shell">
        <Sidebar active={active} onNavigate={setActive} />
        <div className="main-area">
          <Header title={PAGES[active].title} subtitle={PAGES[active].subtitle} />
          <div className="content">
            {['transactions','fx','tax'].includes(active) && <PeriodPicker />}
            <Page />
          </div>
        </div>
      </div>
    </StatementPeriod></AppProvider></AccountGate></Preferences>
  );
}
