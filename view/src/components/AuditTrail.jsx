import { usePreferences } from '../context/Preferences';
import React from 'react';

const workflows = {
  tax_prepayment: 'Tax prepayment',
  fx_forward: 'Currency forward',
  money_market: 'Money market enquiry',
  capex: 'Equipment financing',
  investment: 'Investment decision',
  liquidity: 'Liquidity decision',
};
const stages = {
  assessed: 'Agent review completed',
  approved: 'Owner approved',
  rejected: 'Owner declined',
  simulated: 'Simulation recorded',
};
const order = ['assessed', 'approved', 'rejected', 'simulated'];

export default function AuditTrail({ events }) {
  const { t: tr, locale } = usePreferences();
  const records = new Map();
  for (const event of events) {
    const key = event.kind + '-' + event.number;
    if (!records.has(key)) records.set(key, []);
    records.get(key).push(event);
  }
  return (
    <div className="audit-trail">
      {Array.from(records, ([key, list]) => {
        const latest = list[0];
        const steps = [...list].sort(
          (a, b) =>
            a.occurred_at.localeCompare(b.occurred_at) ||
            order.indexOf(a.event) - order.indexOf(b.event),
        );
        return (
          <article key={key}>
            <header>
              <strong>{tr(workflows[latest.kind] || latest.kind)}</strong>
              <small> {(["liquidity","investment"].includes(latest.kind)?tr("Agent decision ID #","Numer decyzji agenta #"):tr("Simulation ID #","Numer symulacji #"))}{latest.number} · {new Date(latest.occurred_at).toLocaleDateString(locale)}
              </small>
            </header>
            <ol>
              {steps.map((s, i) => (
                <li key={i}>
                  <span>{tr(stages[s.event] || s.event)}</span>
                  <time dateTime={s.occurred_at}>
                    {new Date(s.occurred_at).toLocaleTimeString(locale)}
                  </time>
                </li>
              ))}
            </ol>
          </article>
        );
      })}
    </div>
  );
}
