import BalanceChart from './BalanceChart';
import React, { useEffect, useState } from 'react';
import { useApp } from '../context/AppContext';
import { usePreferences } from '../context/Preferences';
import { api } from '../lib/api';
import { cents, monthHistory, budgetCoverage } from '../lib/cashMetrics';

function Ring({ value, label, detail, display = value == null ? '—' : value + '%' }) {
  const color =
    value == null
      ? 'var(--border)'
      : value < 35
        ? '#d85858'
        : value < 70
          ? '#d8a62e'
          : '#449666';
  return (
    <div className="cash-ring">
      <svg
        viewBox="0 0 80 80"
        role="img"
        aria-label={label + ' ' + display}
        style={{ color }}
      >
        <circle className="ring-track" cx="40" cy="40" r="35" />
        <circle cx="40" cy="40" r="25" fill="currentColor" opacity=".18" />
        <circle
          key={value}
          className="ring-value"
          cx="40"
          cy="40"
          r="35"
          pathLength="100"
          strokeDasharray="100"
          strokeDashoffset={100 - (value ?? 0)}
          transform="rotate(-90 40 40)"
        />
        <text x="40" y="45" textAnchor="middle">
          {display}
        </text>
      </svg>
      <strong>{label}</strong>
      <small>{detail}</small>
    </div>
  );
}

export function CashOverview() {
  const { state } = useApp(),
    { t, money } = usePreferences();
  const { forecast: fc, reconciliation: r } = state.analysis;
  const budget = budgetCoverage(
    state.analysis,
    state.transactions.length > 0 || state.analysis.plan.length > 0,
  );
  const amounts = state.analysis.plan.map(flow => cents(flow.amount_eur));
  const receipts = amounts.reduce((sum, amount) => sum + Math.max(0, amount), 0);
  const spending = amounts.reduce((sum, amount) => sum + Math.max(0, -amount), 0);
  const incomeCoverage = spending ? Math.min(100, Math.round(100 * receipts / spending)) : null;
  const due = r.outstanding
    .filter((i) => Number(i.amount_eur) < 0)
    .reduce((s, i) => s - cents(i.amount_eur), 0);
  return (
    <section className="card cash-overview mb-4">
      <div>
        <h3>
          {t('Cash position', 'Stan środków')} · {fc.as_of}
        </h3>
        <dl className="data-strip">
          <div>
            <dt>{t('Current balance', 'Saldo bieżące')}</dt>
            <dd className={Number(fc.opening_balance) > 0 ? 'amount-pos' : 'amount-neg'}>{money(fc.opening_balance)}</dd>
          </div>
          <div>
            <dt>
              {t(
                'Outstanding invoice payables',
                'Nierozliczone zobowiązania z faktur',
              )}
            </dt>
            <dd className={due ? 'amount-neg' : undefined}>{due ? money(due / 100) : '—'}</dd>
          </div>
        </dl>
      </div>
      <Ring
        value={budget}
        label={t('Budget coverage', 'Pokrycie budżetu')}
        detail={t(
          'Lowest share of daily forecast payments covered after the reserve.',
          'Najniższe pokrycie dziennych prognozowanych wydatków po odjęciu rezerwy.',
        )}
      />
      <Ring
        value={incomeCoverage}
        label={t('Expenses covered by receipts')}
        detail={t('Forecast receipts as a share of forecast spending, capped at 100%.')}
      />
    </section>
  );
}

export function SpendingTrends() {
  const { state } = useApp(),
    { t, money } = usePreferences();
  const history = monthHistory(state.transactions, state.settings.as_of),
    months = history.slice(-6);
  const [expanded, setExpanded] = useState(false);
  const categories = [
    ...new Set(months.flatMap((m) => Object.keys(m.categories))),
  ].sort();
  const rows = [
    [t('Cash receipts', 'Wpływy'), months.map(m => m.rows ? m.receipts : null)],
    [t('Average payroll payment', 'Średnia wypłata'), months.map(m => m.payrollCount ? m.payroll / m.payrollCount : null)],
    [t('Payroll per named recipient', 'Płace na odbiorcę'), months.map(m => m.payees.size && !m.unnamedPayroll ? m.payroll / m.payees.size : null)],
    ...categories.map(c => [t(c), months.map(m => m.rows ? (m.categories[c] ?? 0) : null)]),
  ].map(([label, values]) => {
    const observed = values.filter(v => v != null);
    const growth = observed.length >= 2 && observed[0]
      ? 100 * (observed.at(-1) - observed[0]) / observed[0] : null;
    return {label, values, growth};
  });
  const rank = row => row.growth == null ? -1 : Math.abs(row.growth);
  rows.sort((a, b) => rank(b) - rank(a));
  return (
    <>
      <section className="card mb-4 trend-card">
        <h3>{t('Six-month cash trends', 'Przepływy z sześciu miesięcy')}</h3>
        <p className="card-sub">
          {t(
            'Booked EUR equivalents by value month. Change compares the first and last available months. A dash means insufficient data.',
            'Zaksięgowane równowartości EUR według miesiąca waluty. Zmiana porównuje pierwszy i ostatni dostępny miesiąc. Kreska oznacza brak danych.',
          )}
        </p>
        <div className="trend-scroll">
          <table className="table">
            <thead>
              <tr>
                <th>{t('Category')}</th>
                {months.map((m) => (
                  <th key={m.month}>{m.month}</th>
                ))}
                <th>Δ %</th>
              </tr>
            </thead>
            <tbody>
              {(expanded ? rows : rows.slice(0, 5)).map(({label, values, growth}, index) => (
                <tr key={index}>
                  <th scope="row">{label}</th>
                  {values.map((v, i) => <td key={i}>{v == null ? '—' : money(v / 100)}</td>)}
                  <td>{growth == null ? '—' : (Math.round(growth) > 0 ? '+' : '') + Math.round(growth) + '%'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {rows.length > 5 && <button className="btn btn-ghost trend-toggle" aria-expanded={expanded}
          onClick={() => setExpanded(!expanded)}>
          {expanded ? '▴ ' + t('Show fewer') : '▾ ' + t('Show more') + ' (' + (rows.length - 5) + ')'}
        </button>}
      </section>
      <CashResult key={state.revision} revision={state.revision} />
    </>
  );
}

function CashResult({ revision }) {
  const { t, money } = usePreferences();
  const [months, setMonths] = useState(1);
  const [forecast, setForecast] = useState(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setFailed(false);
    api('forecast/chart?' + new URLSearchParams({revision, quarters: 1}))
      .then(data => { if (active) setForecast(data); })
      .catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, [revision, attempt]);
  let net;
  let endDate;
  let differences = [];
  if (forecast) {
    const start = new Date(forecast.as_of + 'T00:00:00Z');
    const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + months + 1, 0));
    end.setUTCDate(Math.min(start.getUTCDate(), end.getUTCDate()));
    endDate = end.toISOString().slice(0, 10);
    const close = forecast.daily_balances.find(point => point.day === endDate);
    differences = [
      { day: forecast.as_of, balance: 0 },
      ...forecast.daily_balances.filter(point => point.day > forecast.as_of && point.day <= endDate)
        .map(point => ({ day: point.day, balance: (cents(point.balance) - cents(forecast.opening_balance)) / 100 })),
    ];
    if (close) net = (cents(close.balance) - cents(forecast.opening_balance)) / 100;
  }
  return <section className="card mb-4">
    <h3>{t('Forecast cash difference')}</h3>
    <div className="controls quarter-picker" role="group" aria-label={t('Forecast period', 'Okres prognozy')}>
      {[1, 2, 3].map(n => <button key={n} className="btn btn-ghost" aria-pressed={months === n}
        onClick={() => setMonths(n)}>{t(['1 month', '2 months', '3 months'][n - 1])}</button>)}
    </div>
    {net != null ? <>
      <p className="card-sub">{t('Expected receipts minus planned payments through')} {endDate}</p>
      <strong className={net < 0 ? 'amount-neg' : net > 0 ? 'amount-pos' : undefined}>{money(net)}</strong>
      <BalanceChart points={differences} seriesLabel={t('Forecast cash difference')} neutral />
    </> : failed ? <p role="alert">{t('Forecast unavailable.', 'Prognoza niedostępna.')} <button className="btn btn-ghost" onClick={() => setAttempt(attempt + 1)}>{t('Retry')}</button></p>
      : <p role="status">{t('Loading forecast…', 'Wczytywanie prognozy…')}</p>}
  </section>;
}
