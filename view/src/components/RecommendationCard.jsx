import { usePreferences } from '../context/Preferences';
import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { nextDay } from '../lib/api';
import CreditOptions from "./CreditOptions";
import DateField from './DateField';
import BalanceChart from './BalanceChart';

const labels = {
  hold: 'Hold cash',
  propose_credit: 'Bridge credit line',
};

function Comparison({ role, proposal, fc }) {
  const { t: tr, money: eur } = usePreferences();
  const { busy, submit } = useApp();
  const [date, setDate] = useState(
    proposal.available_until || nextDay(fc.daily_balances.at(-1).day),
  );
  const [interest, setInterest] = useState('0.00');
  const [comparison, setComparison] = useState(null);
  async function compare(event) {
    event.preventDefault();
    const result = await submit(
      'agents/' + role + '/comparison',
      { terms: { settles_on: date, interest_eur: interest } },
      false,
    );
    setComparison(result);
  }
  return (
    <details className="section">
      <summary>{tr("Compare cash balances")}</summary>
      <form className="controls" onSubmit={compare} onChange={() => setComparison(null)}>
        <DateField
          label={tr("Simulated settlement")}
          value={date}
          min={nextDay(proposal.execute_on)}
          max={proposal.available_until || undefined}
          onChange={(day) => {
            setDate(day);
            setComparison(null);
          }}
          shortcuts={[
            [tr("Next day"), nextDay(proposal.execute_on)],
            [tr("Forecast end"), fc.daily_balances.at(-1).day],
          ]}
        />
        <label> {tr("Assumed interest (€)")} <input
            type="number"
            step=".01"
            min="0"
            required
            value={interest}
            onChange={(e) => setInterest(e.target.value)}
          />
        </label>
        <button disabled={busy} className="btn btn-ghost"> {tr("Compare scenarios")} </button>
      </form>
      {comparison && (
        <>
          <p> {tr("Compare the baseline with the balance after funding or investing, including settlement and assumed interest. Principal outstanding at horizon end:")}{' '}
            {eur(comparison.outstanding_principal)}.
          </p>
          <BalanceChart forecast
            neutral
            points={comparison.baseline}
            action={comparison.with_action}
            reserve={fc.reserve}
          />
        </>
      )}
    </details>
  );
}

function CashPressure({ analysis }) {
  const {t, money} = usePreferences();
  const spending = new Map();
  const net = new Map();
  for (const flow of analysis.plan) {
    const amount = Math.round(Number(flow.amount_eur) * 100);
    net.set(flow.date, (net.get(flow.date) || 0) + amount);
    if (amount < 0) spending.set(flow.category, (spending.get(flow.category) || 0) - amount);
  }
  const largest = [...spending].sort((a,b) => b[1] - a[1])[0];
  const worst = [...net].sort((a,b) => a[1] - b[1])[0];
  return <dl className="data-strip">
    <div><dt>{t('Largest spending category')}</dt><dd>{largest ? t(largest[0]) + ' · ' + money(largest[1]/100) : '—'}</dd></div>
    <div><dt>{t('Largest daily net outflow')}</dt><dd>{worst?.[1] < 0 ? worst[0] + ' · ' + money(-worst[1]/100) : '—'}</dd></div>
  </dl>;
}

export default function RecommendationCard({ role }) {
  const { t: tr, money: eur } = usePreferences();
  const { state, busy, submit } = useApp();
  const [expanded, setExpanded] = useState(false);
  const drivers = state.analysis.forecast.drivers;
  const saved = state.assessments[role];
  const unresolved = Object.keys(state.analysis.reconciliation.ambiguous).length;
  if (!saved)
    return (
      <div className="rec-block">
        <p>
          {unresolved
            ? tr("Check ambiguous invoice references in your source files and reimport the corrected data.")
            : tr("Ask Qwen to review the current forecast and explain a decision.")}
        </p>
        <button
          className="btn btn-primary"
          disabled={busy || !!unresolved}
          onClick={() => submit('agents/' + role)}
        >
          {busy ? tr("Working…") : tr('Run liquidity agent')}
        </button>
      </div>
    );
  const p = saved.recommendation;
  return (
    <div className="rec-block">
      <h4>
        {tr(labels[p.action])} {p.product && '· ' + eur(p.amount)}
      </h4>
      {p.product && (
        <p> {tr("Effective")} {p.execute_on}
          {p.available_until && ' ' + tr("· Available through") + ' ' + p.available_until}
        </p>
      )}
      {p.explanation && <p>{tr(p.explanation)}</p>}
      <CashPressure analysis={state.analysis} />
      {role === 'liquidity' && drivers.length > 0 && (
        <>
        <table className="table section">
          <caption>{tr("Planned outflows contributing to the shortfall")}</caption>
          <thead>
            <tr>
              <th>{tr("Payment date")}</th>
              <th>{tr("Category")}</th>
              <th>{tr("Amount")}</th>
            </tr>
          </thead>
          <tbody>
            {(expanded ? drivers : drivers.slice(0, 3)).map((d, i) => (
              <tr key={i}>
                <td className="date-cell">{d.date}</td>
                <td>{tr(d.category)}</td>
                <td>{eur(d.amount_eur)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {drivers.length > 3 && <button type="button" className="btn btn-ghost section" aria-expanded={expanded}
          onClick={() => setExpanded(!expanded)}>
          {expanded ? tr('Show fewer') : tr('Show more') + ' (' + (drivers.length - 3) + ')'}
        </button>}
        </>
      )}
      {p.action==='propose_credit' && <CreditOptions key={state.revision} forecast={state.analysis.forecast} proposal={p}/>}
      <h4>{tr("Risks to consider")}</h4>
      <ul>
        {p.risks.map((r) => (
          <li key={r}>{tr(r)}</li>
        ))}
      </ul>
      <div className="badge badge-sim">
        {tr(saved.status.replace('_', ' '))}{' '}
        {saved.application_id && ' · ' + tr('Request #') + saved.application_id}
      </div>
      {saved.status==='simulated' && <p>{tr('Owner-approved simulation. Bank execution has not been reported.','Symulacja zatwierdzona przez właściciela. Brak potwierdzenia wykonania przez bank.')}</p>}
      {saved.status === 'pending' && (
        <div className="modal-actions">
          {['reject', 'approve'].map((c) => (
            <button
              key={c}
              className={'btn ' + (c === 'approve' ? 'btn-primary' : 'btn-ghost')}
              disabled={busy}
              onClick={() => submit('agents/' + role + '/decision/' + c)}
            >
              {c === 'approve' ? tr("Approve (simulation)") : tr("Reject")}
            </button>
          ))}
        </div>
      )}
      {p.product && (
        <Comparison key={saved.id} role={role} proposal={p} fc={state.analysis.forecast} />
      )}
    </div>
  );
}
