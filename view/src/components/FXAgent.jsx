import React from 'react';
import { useApp } from '../context/AppContext';
import { eur } from '../lib/api';
import { LineChart, Line, Tooltip, ResponsiveContainer, XAxis, YAxis } from 'recharts';
import SimulationForm from './SimulationForm';

export default function FXAgent() {
  const { state } = useApp();
  const rows = state.transactions.filter((t) => t.currency === 'CHF');
  const fx = state.fx;
  return (
    <>
      <section className="card mb-4">
        <div className="card-title">Booked currency exposure</div>
        <p>
          Net CHF movements {fx.booked_chf} CHF · EUR equivalent {eur(fx.booked_eur)}
        </p>
        {fx.rates.length > 0 && (
          <>
            <p className="card-sub">
              Effective EUR per CHF on booked payments through {state.settings.as_of}
            </p>
            <div className="chart-wrap">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={fx.rates.map((p) => ({ ...p, rate: Number(p.rate) }))}>
                  <XAxis dataKey="day" />
                  <YAxis domain={['auto', 'auto']} width={65} />
                  <Tooltip contentStyle={{ background: '#172042' }} />
                  <Line
                    dataKey="rate"
                    name="Booked EUR per CHF"
                    stroke="#6ea8ff"
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
          Through {state.settings.as_of}. EUR values use each payment’s booked rate.
        </p>
        {rows.length ? (
          <table className="table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Payment</th>
                <th>CHF</th>
                <th>EUR</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((t) => (
                <tr key={t.source_row}>
                  <td>{t.value_on}</td>
                  <td>{t.reference}</td>
                  <td>{t.amount}</td>
                  <td>{eur(t.amount_eur)}</td>
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
