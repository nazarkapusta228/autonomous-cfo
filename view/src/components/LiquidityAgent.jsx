import { usePreferences } from '../context/Preferences';
import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import DateField from './DateField';
import BalanceChart from './BalanceChart';
import RecommendationCard from './RecommendationCard';

function Inputs() {
  const { t: tr } = usePreferences();
  const { state, busy, submit, setError } = useApp();
  const [settings, setSettings] = useState(state.settings);
  const [files, setFiles] = useState({});
  const [remove, setRemove] = useState(false);
  const fields = [
    [tr("Cut-off date"), 'as_of', 'date'],
    [tr("Opening balance before first booking (€)"), 'starting_balance', 'number'],
    [tr("Safety reserve (€)"), 'reserve', 'number'],
    [tr("Forecast days"), 'horizon_days', 'number'],
  ];
  async function run(e) {
    e.preventDefault();
    try {
      const payload = { settings };
      for (const [k, file] of Object.entries(files)) {
        if (file) payload[k] = await file.text();
      }
      if (remove) payload.invoices = '';
      await submit('forecast', payload);
    } catch (error) {
      setError(error.message);
    }
  }
  return (
    <form className="card mb-4" onSubmit={run}>
      <div className="card-title">{tr("Forecast settings")}</div>
      <div className="card-sub"> {tr("The opening balance is cash before the first statement entry. Booked movements through the cut-off set the forecast starting point. The reserve is the minimum cash cushion you want to keep.")} </div>
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
      <details className="section">
        <summary>{tr("Import CSV files")}</summary>
        <p> {tr("Leave a field empty to keep its current file.")} </p>
        <div className="controls">
          {[
            ['statement', tr("Bank statement")],
            ['plan', tr("Cash flow plan")],
            ['invoices', tr("Invoices")],
          ].map(([k, label]) => (
            <label key={k}>
              {label}
              <input
                type="file"
                accept=".csv,text/csv"
                disabled={k === 'invoices' && remove}
                onChange={(e) => setFiles({ ...files, [k]: e.target.files[0] })}
              />
            </label>
          ))}
        </div>
        {state.has_invoices && (
          <label>
            <input type="checkbox" checked={remove} onChange={(e) => setRemove(e.target.checked)} />{' '} {tr("Remove imported invoices")} </label>
        )}
        <p> {tr("Plan: date,category,amount_eur,description (optional invoice_id). Invoices: invoice_id;counterparty;issued_on;due_on;amount_eur. Use ISO dates and signed EUR amounts.")} </p>
      </details>
      <button className="btn btn-primary" disabled={busy}>
        {busy ? tr("Working…") : tr("Run forecast")}
      </button>
    </form>
  );
}

function FlowTable({ flows, risk = false, showSource = false }) {
  const { t: tr, money: eur } = usePreferences();
  const largest = flows.reduce((max, flow) => Math.max(max, Math.abs(Number(flow.amount_eur))), 0);
  return (
    <table className="table">
      <thead>
        <tr>
          <th>{tr("Date")}</th>
          <th>{tr("Payment")}</th>
          <th>{tr("Category")}</th>
          {showSource && <th>{tr("Source")}</th>}
          <th className="numeric">{tr("Amount")}</th>
        </tr>
      </thead>
      <tbody>
        {flows.map((flow, i) => (
          <tr key={i}>
            <td className="date-cell">{flow.date}</td>
            <td>{flow.description}</td>
            <td>{flow.category}</td>
            {showSource && (
              <td>{flow.invoice_id ? tr("Invoice") + ' ' + flow.invoice_id : tr("Cash flow plan")}</td>
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
          </tr>
        ))}
      </tbody>
    </table>
  );
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
        <section className="card">
          <div className="card-title">{tr("Forecast ·")} {state.settings.horizon_days} {tr("days")}</div>
          <p className="card-sub"> {tr("Daily closing balance. Reserve")} {eur(f.reserve)}{tr(". Minimum")} {eur(f.minimum_balance)}{' '} {tr("on")} {f.minimum_on}.
          </p>
          <BalanceChart
            neutral
            points={[{ day: f.as_of, balance: f.opening_balance }, ...f.daily_balances]}
            reserve={f.reserve}
          />
        </section>
      </div>
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
        <p className="card-sub"> {tr("Expected movements in this forecast come from the cash flow plan CSV and eligible outstanding invoices.")} </p>
        {a.plan.length ? (
          <FlowTable flows={a.plan} showSource />
        ) : (
          <p>{tr("No planned entries within this forecast period.")}</p>
        )}
      </section>
    </>
  );
}
