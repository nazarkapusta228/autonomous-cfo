import React from 'react';
import { useApp } from '../context/AppContext';
import { eur } from '../lib/api';
import SimulationForm from './SimulationForm';

export default function TaxAgent() {
  const { state } = useApp();
  const rows = state.transactions.filter((t) => t.category.toLowerCase() === 'taxes');
  const planned = state.analysis.plan.filter((p) =>
    /tax|steuer/i.test(p.category + ' ' + p.description),
  );
  return (
    <>
      <SimulationForm
        key={state.revision}
        kind="tax_prepayment"
        title="Adjusted tax prepayment"
        description="Use an amount from a tax notice or your accountant. Approving records a simulated filing in this workspace."
      />
      <section className="card mb-4">
        <div className="card-title">Tax payment calendar</div>
        <p className="card-sub">
          Forecast entries whose category or description mentions tax or Steuer.
        </p>
        {planned.length ? (
          <table className="table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Planned payment</th>
                <th>Amount (EUR)</th>
              </tr>
            </thead>
            <tbody>
              {planned.map((p, i) => (
                <tr key={i}>
                  <td>{p.date}</td>
                  <td>{p.description}</td>
                  <td className={Number(p.amount_eur) < 0 ? 'amount-neg' : 'amount-pos'}>
                    {eur(p.amount_eur)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p>No identified tax payments in the current plan.</p>
        )}
      </section>
      <section className="card">
        <div className="card-title">Booked tax payments</div>
        <p className="card-sub">
          Bank statement entries categorized as Taxes through the cut-off date.
        </p>
        {rows.length ? (
          <table className="table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Reference</th>
                <th>Amount</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((t) => (
                <tr key={t.source_row}>
                  <td>{t.value_on}</td>
                  <td>{t.reference}</td>
                  <td className={Number(t.amount_eur) < 0 ? 'amount-neg' : 'amount-pos'}>
                    {eur(t.amount_eur)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p>No payments categorized as Taxes.</p>
        )}
      </section>
    </>
  );
}
