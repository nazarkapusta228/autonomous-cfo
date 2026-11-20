import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { eur, nextDay } from '../lib/api';
import DateField from './DateField';
import BalanceChart from './BalanceChart';

const labels = {
  hold: 'Hold cash',
  propose_credit: 'Bridge credit line',
  propose_investment: 'Term deposit',
};

function Comparison({ role, proposal, fc }) {
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
      <summary>Compare cash balances</summary>
      <form className="controls" onSubmit={compare} onChange={() => setComparison(null)}>
        <DateField
          label="Simulated settlement"
          value={date}
          min={nextDay(proposal.execute_on)}
          max={proposal.available_until || undefined}
          onChange={(day) => {
            setDate(day);
            setComparison(null);
          }}
          shortcuts={[
            ['Next day', nextDay(proposal.execute_on)],
            ['Forecast end', fc.daily_balances.at(-1).day],
          ]}
        />
        <label>
          Assumed interest (€)
          <input
            type="number"
            step=".01"
            min="0"
            required
            value={interest}
            onChange={(e) => setInterest(e.target.value)}
          />
        </label>
        <button disabled={busy} className="btn btn-ghost">
          Compare scenarios
        </button>
      </form>
      {comparison && (
        <>
          <p>
            Compare the baseline with the balance after funding or investing, including settlement
            and assumed interest. Principal outstanding at horizon end:{' '}
            {eur(comparison.outstanding_principal)}.
          </p>
          <BalanceChart
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

export default function RecommendationCard({ role }) {
  const { state, busy, submit } = useApp();
  const saved = state.assessments[role];
  const unresolved = Object.keys(state.analysis.reconciliation.ambiguous).length;
  if (!saved)
    return (
      <div className="rec-block">
        <p>
          {unresolved
            ? 'Resolve the invoice matches in Transactions first.'
            : 'Ask Qwen to review the current forecast and explain a decision.'}
        </p>
        <button
          className="btn btn-primary"
          disabled={busy || !!unresolved}
          onClick={() => submit('agents/' + role)}
        >
          {busy ? 'Working…' : 'Run ' + role + ' agent'}
        </button>
      </div>
    );
  const p = saved.recommendation;
  return (
    <div className="rec-block">
      <h4>
        {labels[p.action]} {p.product && '· ' + eur(p.amount)}
      </h4>
      {p.product && (
        <p>
          Effective {p.execute_on}
          {p.available_until && ' · Available through ' + p.available_until}
        </p>
      )}
      {role === 'investment' && (
        <dl className="data-strip">
          <div>
            <dt>Operations</dt>
            <dd>{eur(p.operating_cash)}</dd>
          </div>
          <div>
            <dt>Safety reserve</dt>
            <dd>{eur(p.reserve_cash)}</dd>
          </div>
          <div>
            <dt>Free to invest</dt>
            <dd className="amount-pos">{eur(p.free_cash)}</dd>
          </div>
        </dl>
      )}
      {role === 'liquidity' && (
        <dl className="data-strip">
          <div>
            <dt>Lowest projected cash</dt>
            <dd>{eur(state.analysis.forecast.minimum_balance)}</dd>
          </div>
          <div>
            <dt>Target reserve</dt>
            <dd>{eur(state.analysis.forecast.reserve)}</dd>
          </div>
          <div>
            <dt>Funding gap</dt>
            <dd>{eur(state.analysis.forecast.funding_needed)}</dd>
          </div>
        </dl>
      )}
      {role === 'investment' &&
        Number(p.operating_cash) + Number(p.reserve_cash) + Number(p.free_cash) > 0 && (
          <div
            className="allocation"
            role="img"
            aria-label="Share of cash for operations, reserve and investment"
          >
            {[p.operating_cash, p.reserve_cash, p.free_cash].map((v, i) => (
              <span
                key={i}
                title={['Operations', 'Safety reserve', 'Free to invest'][i] + ' · ' + eur(v)}
                style={{ flex: Number(v) }}
              />
            ))}
          </div>
        )}
      {role === 'liquidity' && state.analysis.forecast.drivers.length > 0 && (
        <table className="table section">
          <caption>Planned outflows contributing to the shortfall</caption>
          <thead>
            <tr>
              <th>Payment date</th>
              <th>Category</th>
              <th>Amount</th>
            </tr>
          </thead>
          <tbody>
            {state.analysis.forecast.drivers.map((d, i) => (
              <tr key={i}>
                <td className="date-cell">{d.date}</td>
                <td>{d.category}</td>
                <td>{eur(d.amount_eur)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <h4>Risks to consider</h4>
      <ul>
        {p.risks.map((r) => (
          <li key={r}>{r}</li>
        ))}
      </ul>
      <div className="badge badge-sim">
        {saved.status.replace('_', ' ')}{' '}
        {saved.application_id && ' · Request #' + saved.application_id}
      </div>
      {saved.status === 'pending' && (
        <div className="modal-actions">
          {['reject', 'approve'].map((c) => (
            <button
              key={c}
              className={'btn ' + (c === 'approve' ? 'btn-primary' : 'btn-ghost')}
              disabled={busy}
              onClick={() => submit('agents/' + role + '/decision/' + c)}
            >
              {c === 'approve' ? 'Approve (simulation)' : 'Reject'}
            </button>
          ))}
        </div>
      )}
      <div className="section">
        <span
          className="decision-lock"
          tabIndex={0}
          title="Already assessed for this forecast. Change forecast inputs and run the forecast to generate another decision."
        >
          <button disabled className="btn btn-ghost">
            Regenerate decision
          </button>
        </span>
        <p className="card-sub">
          Already assessed. Change inputs in Liquidity Agent and run the forecast to enable a new
          decision.
        </p>
      </div>
      {p.product && (
        <Comparison key={saved.id} role={role} proposal={p} fc={state.analysis.forecast} />
      )}
    </div>
  );
}
