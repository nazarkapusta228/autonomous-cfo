import React from 'react';
import { useApp } from '../context/AppContext';
import { eur } from '../lib/api';
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
  const { state } = useApp();
  const rows = state.transactions.filter((t) => t.currency === 'CHF');
  const fx = state.fx;
  const largest = Math.max(1, ...rows.map((t) => Math.abs(Number(t.amount_eur))));
  return (
    <>
      <section className="card mb-4">
        <div className="card-title">Booked currency exposure</div>
        <p className="card-sub">
          Net amounts from CHF transactions in the bank statement through the cut-off.
        </p>
        <dl className="data-strip">
          <div>
            <dt>Net CHF movements</dt>
            <dd>{fx.booked_chf} CHF</dd>
          </div>
          <div>
            <dt>Booked EUR equivalent</dt>
            <dd>{eur(fx.booked_eur)}</dd>
          </div>
        </dl>
        {fx.rates.length > 0 && (
          <>
            <p className="card-sub">
              Each point is the EUR cost of one CHF on a booked payment through{' '}
              {state.settings.as_of}. A rising line means each franc cost more euros.
            </p>
            <div className="chart-wrap">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  accessibilityLayer
                  data={fx.rates.map((p) => ({ ...p, rate: Number(p.rate) }))}
                >
                  <CartesianGrid vertical={false} stroke="#526080" strokeDasharray="3 5" />
                  <XAxis
                    dataKey="day"
                    tickFormatter={(day) => day.slice(5)}
                    minTickGap={26}
                    stroke="#ccd7ef"
                  />
                  <YAxis
                    domain={['auto', 'auto']}
                    width={74}
                    tickFormatter={(rate) => rate.toFixed(4)}
                    stroke="#ccd7ef"
                  />
                  <Tooltip contentStyle={{ background: '#172042' }} />
                  <Line
                    dataKey="rate"
                    name="Booked EUR per CHF"
                    stroke="#9aceff"
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
        title="CHF forward simulation"
        description="Enter a future CHF obligation and an assumed exchange rate to estimate its EUR cost."
      />
      <section className="card">
        <div className="card-title">Booked CHF payments</div>
        <p className="card-sub">
          These are payments already posted in CHF through {state.settings.as_of}. The bars compare
          their absolute EUR values. A minus sign means money left the account.
        </p>
        {rows.length ? (
          <table className="table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Payment</th>
                <th>CHF</th>
                <th>EUR at booking</th>
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
                    <span className="chf-bar" aria-hidden="true">
                      <i
                        style={{ width: (Math.abs(Number(t.amount_eur)) / largest) * 100 + '%' }}
                      />
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p>No booked CHF payments.</p>
        )}
      </section>
    </>
  );
}
