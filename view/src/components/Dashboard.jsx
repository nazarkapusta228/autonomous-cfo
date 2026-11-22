import { usePreferences } from '../context/Preferences';
import React from 'react';
import { useApp } from '../context/AppContext';
import {CashOverview, SpendingTrends, monthEnd, useQuarterOutlook} from "./CashOverview";
import BalanceChart from './BalanceChart';

export default function Dashboard() {
  const {state} = useApp();
  return <Overview key={state.revision} />;
}

function Overview() {
  const { t: tr, money: eur, prefs } = usePreferences();
  const { state } = useApp();
  const fc = state.analysis.forecast;
  const outlook = useQuarterOutlook(state.revision);
  const end = monthEnd(fc.as_of, 1);
  const daily = fc.daily_balances.at(-1)?.day >= end ? fc.daily_balances : outlook.forecast?.daily_balances;
  const period = daily?.filter(p => p.day <= end);
  const lowest = period?.reduce((min, point) => Number(point.balance) < Number(min.balance) ? point : min);
  const metrics = [
    [
      tr('Lowest balance over the next month'),
      lowest ? eur(lowest.balance) : '—',
      lowest ? period[0].day + ' – ' + end + ' · ' + tr('Minimum on') + ' ' + lowest.day
        : tr(outlook.failed ? 'Forecast unavailable.' : 'Loading forecast…'),
      lowest && Number(lowest.balance) < 0,
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
      !Number(fc.funding_needed) ? tr('Minimum headroom above reserve','Minimalna nadwyżka nad rezerwą')+' · '+eur(Math.min(Number(fc.minimum_balance),Number(fc.opening_balance))-Number(fc.reserve)) : tr('Forecast shortfall against the reserve of', 'Prognozowany niedobór względem rezerwy') + ' ' + eur(fc.reserve) + '.',
      false,
    ],
  ];
  return (
    <>
      <CashOverview/>
      <div className="kpi-grid dashboard-kpis">
        {metrics.map(([k, v, hint, attention]) => (
          <div className="kpi" key={k}>
            <div className="kpi-label">{k}</div>
            <div className={attention ? 'kpi-value amount-neg' : 'kpi-value'}>{v}</div>
            <p className="metric-hint">{hint}</p>
          </div>
        ))}
      </div>
      <section className="card mb-4">
        <div className="card-title">{tr("Cash balance forecast")}</div>
        <p className="card-sub"> {tr("Starting at the cut-off balance, each day adds expected receipts and subtracts planned payments. The dashed line marks your safety reserve.")} </p>
        <BalanceChart centered forecast
          neutral
          points={[{ day: fc.as_of, balance: fc.opening_balance }, ...fc.daily_balances]}
          reserve={fc.reserve}
        />
      </section>
      <SpendingTrends outlook={outlook}/>
      {(() => {
        const closingCents = Math.round(Number(fc.opening_balance) * 100);
        const movementCents = state.transactions
          .filter(row => row.booked_on === fc.as_of || row.value_on === fc.as_of)
          .reduce((sum, row) => sum + Math.round(Number(row.amount_eur) * 100), 0);
        const previousCents = closingCents - movementCents;
        const alerts = [];
        if (prefs.change && previousCents !== 0 && Math.abs(movementCents) * 100 >= Math.abs(previousCents) * prefs.changeThreshold)
          alerts.push(tr('Large daily balance change', 'Duża dzienna zmiana salda') + ' · ' + fc.as_of);
        const firstLow = [{ day: fc.as_of, balance: fc.opening_balance }, ...fc.daily_balances]
          .find(point => Number(point.balance) <= Number(fc.reserve));
        if (prefs.low && firstLow)
          alerts.push(tr('Forecast balance reaches the reserve', 'Prognozowane saldo osiąga poziom rezerwy') + ' · ' + firstLow.day + ' · ' + eur(firstLow.balance));
        return alerts.length > 0 && <section className="card mb-4"><h3>{tr('Notifications','Powiadomienia')}</h3>{alerts.map(message => <p key={message}>{message}</p>)}</section>;
      })()}
    </>
  );
}
