import { usePreferences } from '../context/Preferences';
import { usePeriod } from '../context/StatementPeriod';
import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import {
  CartesianGrid,
  LineChart,
  Line,
  Tooltip,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from 'recharts';

export default function FXAgent() {
  const { t: tr, money: eur, originalMoney } = usePreferences();
  const { state } = useApp();
  const period = usePeriod();
  const currencies = [...new Set((state.statement_rows ?? state.transactions)
    .map(row => row.currency).filter(code => code !== 'EUR'))].sort();
  const [selection, setSelection] = useState('');
  const currency = currencies.includes(selection) ? selection : currencies[0];
  if (!currency) return <section className="card">{tr('No foreign currency payments in this statement.', 'Brak płatności walutowych w tym wyciągu.')}</section>;
  const rows = period.rows.filter(row => row.currency === currency);
  const pair = 'EUR/' + currency;
  const fx = {
    booked_foreign: rows.reduce((sum, row) => sum + Number(row.amount), 0).toFixed(2),
    booked_eur: rows.reduce((sum, row) => sum + Number(row.amount_eur), 0),
    rates: rows.filter(row => row.booked_rate != null)
      .map(row => ({ day: row.value_on, rate: row.booked_rate })).reverse(),
  };
  return (
    <>
      <section className="card mb-4">
        <div className="card-title">{tr("Booked currency exposure")}</div>
        {currencies.length > 1 && <label className="controls">{tr('Statement currency', 'Waluta wyciągu')}
          <select value={currency} onChange={e => setSelection(e.target.value)}>
            {currencies.map(code => <option key={code}>{code}</option>)}
          </select></label>}
        <dl className="data-strip">
          <div>
            <dt>{tr('Net movements', 'Przepływy netto')}</dt>
            <dd>{originalMoney(fx.booked_foreign, currency)}</dd>
          </div>
          <div>
            <dt>{tr("Booked equivalent")}</dt>
            <dd>{eur(fx.booked_eur)}</dd>
          </div>
        </dl>
        {fx.rates.length > 0 && (
          <>
            <p className="card-sub">{tr('Booked exchange rate', 'Kurs księgowy')} · {pair}</p>
            <div className="chart-wrap">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  accessibilityLayer
                  data={fx.rates.map((p) => ({ ...p, rate: Number(p.rate) }))}
                >
                  <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 5" />
                  <XAxis
                    dataKey="day"
                    tickFormatter={(day) => day.slice(5)}
                    minTickGap={26}
                    stroke="var(--text-muted)"
                  />
                  <YAxis
                    domain={['auto', 'auto']}
                    width={74}
                    tickFormatter={(rate) => rate.toFixed(4)}
                    stroke="var(--text-muted)"
                  />
                  <Tooltip contentStyle={{ background: 'var(--bg-card)' }} />
                  <Line
                    dataKey="rate"
                    name={pair}
                    stroke="var(--primary)"
                    strokeWidth={3}
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </>
        )}
      </section>
      <section className="card">
        <div className="card-title">{tr("Booked CHF payments").replace("CHF", currency)}</div>
        <p className="card-sub"> {tr("These are payments already posted in CHF through").replace("CHF", currency)} {period.end}{tr(". A minus sign means money left the account.")} </p>
        {rows.length ? (
          <table className="table">
            <thead>
              <tr>
                <th>{tr("Date")}</th>
                <th>{tr("Payment")}</th>
                <th>{tr("Amount")}</th>
                <th>{tr("Booking value")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((t) => (
                <tr key={t.source_row}>
                  <td>{t.value_on}</td>
                  <td>{t.reference}</td>
                  <td className={Number(t.amount) < 0 ? 'amount-neg' : 'amount-pos'}>{originalMoney(t.amount, currency)}</td>
                  <td className={Number(t.amount_eur) < 0 ? 'amount-neg' : 'amount-pos'}>
                    {eur(t.amount_eur)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p>{tr("No booked CHF payments.").replace("CHF", currency)}</p>
        )}
      </section>
    </>
  );
}
