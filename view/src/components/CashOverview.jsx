import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { usePreferences } from '../context/Preferences';
import { cents, monthHistory, coverageScores } from '../lib/cashMetrics';

function Ring({ value, label, detail }) {
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
        aria-label={label + ' ' + (value == null ? '—' : value + '%')}
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
          {value == null ? '—' : value + '%'}
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
  const months = monthHistory(state.transactions, fc.as_of);
  const [budget, fixed] = coverageScores(
    state.analysis,
    months,
    state.transactions.length > 0 || state.analysis.plan.length > 0,
  );
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
            <dd>{money(fc.opening_balance)}</dd>
          </div>
          <div>
            <dt>
              {t(
                'Outstanding invoice payables',
                'Nierozliczone zobowiązania z faktur',
              )}
            </dt>
            <dd>{state.has_invoices ? money(due / 100) : '—'}</dd>
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
        value={fixed}
        label={t('Fixed-cost coverage', 'Pokrycie kosztów stałych')}
        detail={t(
          'Receipts ÷ rent and payroll, last 3 closed months. Capped at 100%.',
          'Wpływy ÷ czynsz i płace, ostatnie 3 zamknięte miesiące. Maks. 100%.',
        )}
      />
    </section>
  );
}

export function SpendingTrends() {
  const { state } = useApp(),
    { t, money } = usePreferences();
  const history = monthHistory(state.transactions, state.settings.as_of),
    months = history.slice(-6);
  const [period, setPeriod] = useState(3),
    [budget, setBudget] = useState('');
  const recent = history.slice(-3),
    basis = history.slice(-period);
  const sum = (rows, key) => rows.reduce((s, r) => s + r[key], 0);
  const available = recent.every((m) => m.rows),
    equipmentAvailable = basis.every((m) => m.rows);
  const spare = sum(basis, 'receipts') - sum(basis, 'out');
  const categories = [
    ...new Set(months.flatMap((m) => Object.keys(m.categories))),
  ].sort();
  function trend(label, values) {
    const observed = values.filter((v) => v != null);
    const start = observed.length >= 2 ? observed[0] : null,
      end = observed.at(-1);
    const growth =
      start && end != null ? Math.round((100 * (end - start)) / start) : null;
    return (
      <tr key={label}>
        <th scope="row">{label}</th>
        {values.map((v, i) => (
          <td key={i}>{v == null ? '—' : money(v / 100)}</td>
        ))}
        <td>{growth == null ? '—' : (growth > 0 ? '+' : '') + growth + '%'}</td>
      </tr>
    );
  }
  return (
    <>
      <section className="card mb-4">
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
              {trend(
                t('Cash receipts', 'Wpływy'),
                months.map((m) => (m.rows ? m.receipts : null)),
              )}
              {trend(
                t('Average payroll payment', 'Średnia wypłata'),
                months.map((m) =>
                  m.payrollCount ? m.payroll / m.payrollCount : null,
                ),
              )}
              {trend(
                t('Payroll per named recipient', 'Płace na odbiorcę'),
                months.map((m) =>
                  m.payees.size && !m.unnamedPayroll
                    ? m.payroll / m.payees.size
                    : null,
                ),
              )}
              {categories.map((c) =>
                trend(
                  t(c),
                  months.map((m) => (m.rows ? (m.categories[c] ?? 0) : null)),
                ),
              )}
            </tbody>
          </table>
        </div>
      </section>
      <section className="card mb-4">
        <h3>{t('Next three months', 'Następne trzy miesiące')}</h3>
        <p className="card-sub">
          {t(
            'Estimate if the last three closed months repeat. Receipts include all incoming bank payments.',
            'Szacunek przy powtórzeniu ostatnich trzech zamkniętych miesięcy. Wpływy obejmują wszystkie uznania rachunku.',
          )}
        </p>
        <dl className="data-strip">
          {[
            [
              t('Expected receipts', 'Szacowane wpływy'),
              sum(recent, 'receipts'),
            ],
            [
              t('Rent and payroll', 'Czynsz i płace'),
              sum(recent, 'rent') + sum(recent, 'payroll'),
            ],
            [
              t(
                'Receipts after rent and payroll',
                'Wpływy po czynszu i płacach',
              ),
              sum(recent, 'receipts') -
                sum(recent, 'rent') -
                sum(recent, 'payroll'),
            ],
            [
              t('Cash after all spending', 'Przepływ po wszystkich wydatkach'),
              sum(recent, 'receipts') - sum(recent, 'out'),
            ],
          ].map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>{available ? money(v / 100) : '—'}</dd>
            </div>
          ))}
        </dl>
        <h4>{t('Equipment purchase', 'Zakup sprzętu')}</h4>
        <div className="data-tools">
          <label>
            {t('Equipment price (EUR)', 'Cena sprzętu (EUR)')}
            <input
              type="number"
              min=".01"
              step=".01"
              value={budget}
              onChange={(e) => setBudget(e.target.value)}
            />
          </label>
          <label>
            {t('Cash flow period', 'Okres przepływów')}
            <select
              value={period}
              onChange={(e) => setPeriod(Number(e.target.value))}
            >
              <option value="3">
                {t('Last 3 closed months', 'Ostatnie 3 zamknięte miesiące')}
              </option>
              <option value="12">
                {t('Last 12 closed months', 'Ostatnie 12 zamkniętych miesięcy')}
              </option>
            </select>
          </label>
        </div>
        <p className="projection-result">
          {!equipmentAvailable
            ? t(
                'Insufficient statement history for this period.',
                'Brak wystarczającej historii wyciągu dla tego okresu.',
              )
            : Number(budget) > 0
              ? (spare >= cents(budget)
                  ? t('Cash remaining after purchase', 'Nadwyżka po zakupie')
                  : t('Additional cash needed', 'Brakująca kwota')) +
                ' · ' +
                money(Math.abs(spare - cents(budget)) / 100)
              : t('Net cash generated', 'Przepływ netto') +
                ' · ' +
                money(spare / 100)}
        </p>
      </section>
    </>
  );
}
