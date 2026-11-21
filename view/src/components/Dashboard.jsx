import { usePreferences } from '../context/Preferences';
import React from 'react';
import { useApp } from '../context/AppContext';
import {CashOverview, SpendingTrends} from "./CashOverview";
import AuditTrail from './AuditTrail';
import BalanceChart from './BalanceChart';

export default function Dashboard() {
  const { t: tr, money: eur, prefs } = usePreferences();
  const { state } = useApp();
  const fc = state.analysis.forecast;
  const metrics = [
    [
      tr("Lowest balance ·") + ' ' + state.settings.horizon_days + ' ' + tr("days"),
      eur(fc.minimum_balance),
      tr("Lowest forecast close, on") + ' ' + fc.minimum_on + '.',
      Number(fc.minimum_balance) < 0,
    ],
    [
      tr("First deficit"),
      fc.first_deficit_on || tr("None in horizon"),
      tr("First forecast day that closes below zero."),
      false,
    ],
    [
      tr("Funding needed"),
      eur(fc.funding_needed),
      tr('Forecast shortfall against the reserve of', 'Prognozowany niedobór względem rezerwy') + ' ' + eur(fc.reserve) + '.',
      false,
    ],
  ];
  return (
    <>
      <CashOverview/>
      <div className="kpi-grid dashboard-kpis">
        {metrics.map(([k, v, hint, attention]) => (
          <div className={k === tr("Funding needed") ? 'kpi funding-needed' : 'kpi'} key={k}>
            <div className="kpi-label">{k}</div>
            <div className={attention ? 'kpi-value amount-neg' : 'kpi-value'}>{v}</div>
            <p className="metric-hint">{hint}</p>
          </div>
        ))}
      </div>
      <section className="card mb-4">
        <div className="card-title">{tr("Cash balance forecast")}</div>
        <p className="card-sub"> {tr("Starting at the cut-off balance, each day adds expected receipts and subtracts planned payments. The dashed line marks your safety reserve.")} </p>
        <BalanceChart
          neutral
          points={[{ day: fc.as_of, balance: fc.opening_balance }, ...fc.daily_balances]}
          reserve={fc.reserve}
        />
      </section>
      <SpendingTrends/>
      {(() => {
        const closingCents = Math.round(Number(fc.opening_balance) * 100);
        const movementCents = state.transactions
          .filter(row => row.booked_on === fc.as_of || row.value_on === fc.as_of)
          .reduce((sum, row) => sum + Math.round(Number(row.amount_eur) * 100), 0);
        const previousCents = closingCents - movementCents;
        const alerts = [];
        if (prefs.change && previousCents !== 0 && Math.abs(movementCents / previousCents) >= 0.2)
          alerts.push(tr('Large daily balance change', 'Duża dzienna zmiana salda') + ' · ' + fc.as_of);
        const firstLow = [{ day: fc.as_of, balance: fc.opening_balance }, ...fc.daily_balances]
          .find(point => Number(point.balance) <= Number(fc.reserve));
        if (prefs.low && firstLow)
          alerts.push(tr('Forecast balance reaches the reserve', 'Prognozowane saldo osiąga poziom rezerwy') + ' · ' + firstLow.day + ' · ' + eur(firstLow.balance));
        if (prefs.approval && Object.values(state.assessments).some(a => a.status === 'pending'))
          alerts.push(tr('Agent decision awaiting approval', 'Decyzja agenta czeka na zatwierdzenie'));
        return alerts.length > 0 && <section className="card mb-4"><h3>{tr('Notifications','Powiadomienia')}</h3>{alerts.map(message => <p key={message}>{message}</p>)}</section>;
      })()}
      <section className="card">
        <div className="card-title">{tr("Workspace audit")}</div>
        <p className="card-sub"> {tr("Agent runs, decisions and simulations recorded in this workspace, with their reference numbers.")} </p>
        {state.audit.length ? (
          <AuditTrail events={state.audit} />
        ) : (
          <p className="text-muted">{tr("No activity recorded yet.")}</p>
        )}
      </section>
    </>
  );
}
