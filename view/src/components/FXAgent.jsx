import { usePreferences } from '../context/Preferences';
import { usePeriod } from '../context/StatementPeriod';
import React from 'react';
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
import SimulationForm from './SimulationForm';

export default function FXAgent() {
  const { t: tr, money: eur } = usePreferences();
  const { state } = useApp();
  const period = usePeriod();
  const rows = period.rows.filter((t) => t.currency === 'CHF');
  const fx = {
    booked_chf: rows.reduce((sum, row) => sum + Number(row.amount), 0).toFixed(2),
    booked_eur: rows.reduce((sum, row) => sum + Number(row.amount_eur), 0),
    rates: rows.filter(row => Number(row.amount)).map(row => ({day: row.value_on, rate: row.amount_eur / row.amount})).reverse(),
  };
  return (
    <>
      <section className="card mb-4">
        <div className="card-title">{tr("Booked currency exposure")}</div>
        <p className="card-sub"> {tr("Net amounts from CHF transactions in the bank statement in the selected period.")} </p>
        <dl className="data-strip">
          <div>
            <dt>{tr("Net CHF movements")}</dt>
            <dd>{fx.booked_chf} CHF</dd>
          </div>
          <div>
            <dt>{tr("Booked equivalent")}</dt>
            <dd>{eur(fx.booked_eur)}</dd>
          </div>
        </dl>
        {fx.rates.length > 0 && (
          <>
            <p className="card-sub"> {tr("Each point is the EUR cost of one CHF on a booked payment through")}{' '}
              {period.end}{tr(". A rising line means each franc cost more euros.")} </p>
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
                    name={tr("Booked EUR per CHF")}
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
      <SimulationForm
        key={state.revision}
        kind="fx_forward"
        title={tr("CHF forward simulation")}
        description={tr("Enter a future CHF obligation and an assumed exchange rate to estimate its EUR cost.")}
      />
      <section className="card">
        <div className="card-title">{tr("Booked CHF payments")}</div>
        <p className="card-sub"> {tr("These are payments already posted in CHF through")} {period.end}{tr(". A minus sign means money left the account.")} </p>
        {rows.length ? (
          <table className="table">
            <thead>
              <tr>
                <th>{tr("Date")}</th>
                <th>{tr("Payment")}</th>
                <th>CHF</th>
                <th>{tr("Booking value")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((t) => (
                <tr key={t.source_row}>
                  <td>{t.value_on}</td>
                  <td>{t.reference}</td>
                  <td className={Number(t.amount) < 0 ? 'amount-neg' : 'amount-pos'}>{t.amount}</td>
                  <td className={Number(t.amount_eur) < 0 ? 'amount-neg' : 'amount-pos'}>
                    {eur(t.amount_eur)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p>{tr("No booked CHF payments.")}</p>
        )}
      </section>
    </>
  );
}
