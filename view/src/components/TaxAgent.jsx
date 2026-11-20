import { usePreferences } from '../context/Preferences';
import { usePeriod } from '../context/StatementPeriod';
import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import SimulationForm from './SimulationForm';

export default function TaxAgent() {
  const { t: tr, money: eur } = usePreferences();
  const { state } = useApp();
  const period = usePeriod();
  const rows = period.rows.filter((t) => t.category.toLowerCase() === 'taxes');
  const planned = state.analysis.plan.filter((p) =>
    /tax|steuer/i.test(p.category + ' ' + p.description),
  );
  const [month, setMonth] = useState('');
  const months = [...new Set(rows.map((t) => t.value_on.slice(0, 7)))].sort().reverse();
  const filtered = rows.filter((t) => !month || t.value_on.startsWith(month));
  const next = planned.find((p) => Number(p.amount_eur) < 0);
  const paid =
    filtered.reduce((sum, t) => sum + Math.max(0, -Math.round(Number(t.amount_eur) * 100)), 0) /
    100;
  return (
    <>
      <section className="card mb-4">
        <div className="card-title">{tr("Tax overview")}</div>
        <p className="card-sub"> {tr("Compare tax payments already taken from the account with upcoming amounts in the cash flow plan.")} </p>
        <dl className="data-strip">
          <div>
            <dt>{tr("Paid")} {month || period.start + ' – ' + period.end}</dt>
            <dd>{eur(paid)}</dd>
          </div>
          <div>
            <dt>{tr("Next planned outflow")}</dt>
            <dd>{next ? eur(-Number(next.amount_eur)) : tr("None scheduled")}</dd>
          </div>
          <div>
            <dt>{tr("Due date")}</dt>
            <dd>{next?.date || '—'}</dd>
          </div>
        </dl>
      </section>
      <section className="card mb-4">
        <div className="card-title">{tr("Tax payment calendar")}</div>
        <p className="card-sub"> {tr("Forecast entries whose category or description mentions tax or Steuer.")} </p>
        {planned.length ? (
          <table className="table">
            <thead>
              <tr>
                <th>{tr("Date")}</th>
                <th>{tr("Planned payment")}</th>
                <th>{tr("Amount")}</th>
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
          <p>{tr("No identified tax payments in the current plan.")}</p>
        )}
      </section>
      <section className="card">
        <div className="card-title">{tr("Booked tax payments")}</div>
        <p className="card-sub"> {tr("Bank statement entries categorized as Taxes in the selected period.")} </p>
        <label className="controls"> {tr("Booking month")}{' '}
          <select value={month} onChange={(e) => setMonth(e.target.value)}>
            <option value="">{tr("All months")}</option>
            {months.map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
        </label>
        {filtered.length ? (
          <table className="table">
            <thead>
              <tr>
                <th>{tr("Date")}</th>
                <th>{tr("Reference")}</th>
                <th>{tr("Amount")}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((t) => (
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
          <p>{tr("No payments categorized as Taxes.")}</p>
        )}
      </section>
      <SimulationForm
        key={state.revision}
        suggested={next ? String(-Number(next.amount_eur)) : ''}
        suggestedDate={next?.date}
        kind="tax_prepayment"
        title={tr("Adjusted tax prepayment")}
        description={tr("Use an amount from a tax notice or your accountant. Approving records a simulated filing in this workspace.")}
      />
    </>
  );
}
