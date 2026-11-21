import OperatingScenario from './OperatingScenario';
import { usePreferences } from '../context/Preferences';
import React, { useEffect, useState } from 'react';
import { useApp } from '../context/AppContext';
import { api } from '../lib/api';
import PlannedEditor from './PlannedEditor';
import DateField from './DateField';
import BalanceChart from './BalanceChart';
import RecommendationCard from './RecommendationCard';

function Inputs() {
  const { t: tr } = usePreferences();
  const { state, busy, submit } = useApp();
  const [settings, setSettings] = useState(state.settings);
  const fields = [
    [tr("Cut-off date"), 'as_of', 'date'],
    [tr("Safety reserve (€)"), 'reserve', 'number'],
    [tr("Forecast days"), 'horizon_days', 'number'],
  ];
  async function run(e) {
    e.preventDefault();
    await submit('forecast', {settings});
  }
  return (
    <form className="card mb-4" onSubmit={run}>
      <div className="card-title">{tr("Forecast settings")}</div>
      <div className="card-sub"> {tr("Booked movements through the cut-off set the forecast starting point. The reserve is the minimum cash cushion you want to keep.")} </div>
      <div className="controls">
        {fields.map(([label, key, type]) =>
          type === 'date' ? (
            <DateField
              key={key}
              label={label}
              value={settings[key]}
              onChange={(day) => setSettings({ ...settings, as_of: day })}
              shortcuts={[[tr("Last statement date"), state.statement_info.last_date]]}
            />
          ) : (
            <label key={key}>
              {label}
              <input
                type={type}
                required
                step={key === 'horizon_days' ? 1 : type === 'number' ? '.01' : undefined}
                min={key === 'reserve' ? 0 : key === 'horizon_days' ? 1 : undefined}
                max={key === 'horizon_days' ? 366 : undefined}
                value={settings[key]}
                onChange={(e) => setSettings({ ...settings, [key]: e.target.value })}
              />
            </label>
          ),
        )}
      </div>
      <button className="btn btn-primary" disabled={busy}>
        {busy ? tr("Working…") : tr("Run forecast")}
      </button>
    </form>
  );
}

function FlowTable({ flows, risk = false, showSource = false }) {
  const {state}=useApp();
  const { t: tr, money: eur } = usePreferences();
  const [page,setPage]=useState(0), [edit,setEdit]=useState(null);
  const start=showSource ? Math.min(page,Math.max(0,Math.ceil(flows.length/15)-1))*15 : 0;
  const shown=showSource ? flows.slice(start,start+15):flows;
  const largest = flows.reduce((max, flow) => Math.max(max, Math.abs(Number(flow.amount_eur))), 0);
  return (
    <><table className="table">
      <thead>
        <tr>
          <th>{tr("Date")}</th>
          <th>{tr("Payment")}</th>
          <th>{tr("Category")}</th>
          {showSource && <th>{tr("Source")}</th>}
          <th className="numeric">{tr("Amount")}</th>{showSource && <th>{tr("Edit","Edytuj")}</th>}
        </tr>
      </thead>
      <tbody>
        {shown.map((flow, i) => (
          <React.Fragment key={i}><tr>
            <td className="date-cell">{flow.date}</td>
            <td>{flow.description}</td>
            <td>{tr(flow.category)}</td>
            {showSource && (
              <td>{flow.invoice_id ? tr("Invoice") + ' ' + flow.invoice_id : state.uses_statement_projection ? tr("Statement projection","Prognoza z wyciągu") : tr("Cash flow plan")}</td>
            )}
            <td
              className={'numeric ' + (Number(flow.amount_eur) < 0 ? 'amount-neg' : 'amount-pos')}
            >
              {eur(flow.amount_eur)}
              {risk && (
                <span className="payment-bar" aria-hidden="true">
                  <i style={{ width: (Math.abs(Number(flow.amount_eur)) / largest) * 100 + '%' }} />
                </span>
              )}
            </td>
            {showSource && <td><button className="btn btn-ghost" onClick={()=>setEdit(start+i)}>{tr("Edit","Edytuj")}</button></td>}
          </tr>{showSource && edit===start+i && <tr><td colSpan={6}><PlannedEditor index={edit} close={()=>setEdit(null)}/></td></tr>}</React.Fragment>
        ))}
      </tbody>
    </table>{showSource && flows.length>15 && <nav className="controls pagination">
      <button className="btn btn-ghost" disabled={!start} onClick={()=>{setEdit(null);setPage(page-1)}}>{tr("Previous","Wstecz")}</button>
      <span>{start+1}–{Math.min(start+15,flows.length)} / {flows.length}</span>
      <button className="btn btn-ghost" disabled={start+15>=flows.length} onClick={()=>{setEdit(null);setPage(page+1)}}>{tr("Next","Dalej")}</button></nav>}</>
  );
}

function ForecastChart({ revision }) {
  const { t, money } = usePreferences();
  const [quarters, setQuarters] = useState(1);
  const [result, setResult] = useState(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    api('forecast/chart?' + new URLSearchParams({ revision, quarters }))
      .then(forecast => { if (active) setResult({ quarters, forecast }); })
      .catch(() => { if (active) setResult({ quarters, failed: true }); });
    return () => { active = false; };
  }, [revision, quarters, attempt]);
  const current = result?.quarters === quarters ? result : null;
  const f = current?.forecast;
  return <section className="card">
    <h3>{t('Cash balance forecast')}</h3>
    <div className="controls quarter-picker" role="group" aria-label={t('Forecast period', 'Okres prognozy')}>
      {[1, 2, 3, 4].map(n => <button key={n} className="btn btn-ghost" aria-pressed={quarters === n}
        onClick={() => setQuarters(n)}>{n} {n === 1 ? t('quarter', 'kwartał') : t('quarters', 'kwartały')}</button>)}
    </div>
    {f ? <>
      <p className="card-sub">{f.as_of} – {f.daily_balances.at(-1).day} · {t('Reserve')} {money(f.reserve)} ·
        {' '}{t('Lowest projected cash')} {money(f.minimum_balance)} ({f.minimum_on})</p>
      <BalanceChart centered forecast neutral points={[{ day: f.as_of, balance: f.opening_balance }, ...f.daily_balances]} reserve={f.reserve}/>
    </> : current?.failed ? <p role="alert">{t('Forecast unavailable.', 'Prognoza niedostępna.')} <button className="btn btn-ghost"
      onClick={() => { setResult(null); setAttempt(previous => previous + 1); }}>{t('Retry')}</button></p>
      : <p role="status">{t('Loading forecast…', 'Wczytywanie prognozy…')}</p>}
  </section>;
}

export default function LiquidityAgent() {
  const { t: tr, money: eur } = usePreferences();
  const { state } = useApp();
  const a = state.analysis,
    f = a.forecast;
  const riskDay = f.daily_balances.find((point) => point.day === a.payments_at_risk[0]?.date);
  return (
    <>
      <Inputs key={state.revision} />
      <div className="liquidity-results">
        <section className="card">
          <div className="card-title">{tr("Liquidity decision")}</div>
          <RecommendationCard role="liquidity" />
        </section>
        <ForecastChart key={state.revision} revision={state.revision} />
      </div>
      <OperatingScenario key={'scenario-' + state.revision} analysis={a} />
      <section className="card mb-4">
        <div className="card-title">{tr("Payments at risk")}</div>
        <p className="card-sub"> {tr("Outgoing payments on the first payment date that closes below your safety reserve of")}{' '}
          {eur(f.reserve)}{tr(". The bars compare payment sizes.")} </p>
        {a.payments_at_risk.length ? (
          <>
            {riskDay && (
              <dl className="data-strip">
                <div>
                  <dt>{tr("First payment date at risk")}</dt>
                  <dd>{riskDay.day}</dd>
                </div>
                <div>
                  <dt>{tr("Forecast closing balance")}</dt>
                  <dd>{eur(riskDay.balance)}</dd>
                </div>
                <div>
                  <dt>{tr("Gap to reserve that day")}</dt>
                  <dd className="amount-neg">{eur(Number(f.reserve) - Number(riskDay.balance))}</dd>
                </div>
              </dl>
            )}
            <FlowTable flows={a.payments_at_risk} risk />
          </>
        ) : (
          <p>{tr("No planned outgoing payments fall on a below-reserve day.")}</p>
        )}
        {f.drivers.length > 0 && (
          <details className="section">
            <summary>{tr("Payments driving the shortfall")}</summary>
            <p className="card-sub"> {tr("Outflows on net spending days up to the lowest forecast balance.")} </p>
            <FlowTable flows={f.drivers} />
          </details>
        )}
        {a.receipt_delays.length > 0 && (
          <>
            <h4 className="section">{tr("Delayed receipts")}</h4>
            <p className="card-sub"> {tr("Expected dates reflect the customer’s observed payment delays.")} </p>
            <table className="table">
              <thead>
                <tr>
                  <th>{tr("Invoice")}</th>
                  <th>{tr("Due")}</th>
                  <th>{tr("Expected")}</th>
                  <th className="numeric">{tr("Income")}</th>
                </tr>
              </thead>
              <tbody>
                {a.receipt_delays.map((p) => (
                  <tr key={p.invoice_id}>
                    <td>{p.invoice_id}</td>
                    <td>{p.due_on}</td>
                    <td>{p.expected_on}</td>
                    <td className="numeric amount-pos">{eur(p.amount_eur)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </section>
      <section className="card">
        <div className="card-title">{tr("Planned payments and income")}</div>
        <p className="card-sub"> {state.uses_statement_projection ? tr("The baseline repeats known payments from the last four weeks every 28 days. Outstanding invoices are added separately.", "Prognoza powtarza co 28 dni operacje z ostatnich czterech tygodni. Nierozliczone faktury są doliczane osobno.") : tr("Expected movements in this forecast come from the cash flow plan CSV and eligible outstanding invoices.")} </p>
        {a.plan.length ? (
          <FlowTable key={state.revision} flows={a.plan} showSource />
        ) : (
          <p>{tr("No planned entries within this forecast period.")}</p>
        )}
      </section>
    </>
  );
}
