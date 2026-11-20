import React, { useState } from 'react';
import { AppProvider } from './context/AppContext';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import Dashboard from './components/Dashboard';
import LiquidityAgent from './components/LiquidityAgent';
import FXAgent from './components/FXAgent';
import TaxAgent from './components/TaxAgent';
import InvestmentAgent from './components/InvestmentAgent';
import Transactions from './components/Transactions';

const PAGES = {
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
    title: 'FX Hedging',
    subtitle: 'Booked CHF payments and forward simulation',
    component: FXAgent,
  },
  tax: { title: 'Tax planning', subtitle: 'Advance payments & optimization', component: TaxAgent },
  investment: {
    title: 'Investment Agent',
    subtitle: 'Idle liquidity deployment',
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
    <AppProvider>
      <div className="app-shell">
        <Sidebar active={active} onNavigate={setActive} />
        <div className="main-area">
          <Header title={PAGES[active].title} subtitle={PAGES[active].subtitle} />
          <div className="content">
            <Page />
          </div>
        </div>
      </div>
    </AppProvider>
  );
}
