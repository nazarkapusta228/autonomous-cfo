import { usePreferences } from '../context/Preferences';
import { usePeriod } from '../context/StatementPeriod';
import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import BalanceChart from './BalanceChart';

function InvoiceReview() {
  const { t: tr, money: eur } = usePreferences();
  const { state, busy, submit } = useApp();
  const report = state.analysis.reconciliation;
  const [values, setValues] = useState({});
  if (!state.has_invoices) return null;
  return (
    <section className="card mb-4">
      <div className="card-title">{tr("Invoice reconciliation")}</div>
      <p className="card-sub"> {tr("Imported invoices matched against booked statement payments. Confirm uncertain matches below.")} </p>
      <p>
        {Object.keys(report.settled).length} {tr("settled ·")} {report.outstanding.length} {tr("outstanding")} </p>
      {Object.entries(report.settled).map(([invoice, row]) => (
        <p key={invoice}>
          {invoice} {tr("· Settled by statement row")} {row}
        </p>
      ))}
      {report.outstanding.map((i) => (
        <p key={i.invoice_id}>
          {i.invoice_id} · {i.counterparty} {tr("· Due")} {i.due_on} · {eur(i.amount_eur)}
          {report.unprojected_receivables.includes(i.invoice_id) &&
            ' ' + tr("· Excluded from projected receipts")}
        </p>
      ))}
      {Object.entries(report.ambiguous).map(([id, rows]) => (
        <div className="controls" key={id}>
          <label> {tr("Match invoice")} {id}
            <select
              aria-label={tr("Match invoice") + ' ' + id}
              value={values[id] ?? ''}
              onChange={(e) => setValues({ ...values, [id]: e.target.value })}
            >
              <option value="">{tr("Choose a match")}</option>
              <option value="none">{tr("Keep outstanding")}</option>
              {rows.map((r) => {
                const t = state.transactions.find((t) => t.source_row === r);
                return (
                  <option key={r} value={r}> {tr("Row")} {r} · {t?.value_on} · {t?.reference}
                  </option>
                );
              })}
            </select>
          </label>
          <button
            disabled={busy || !values[id]}
            className="btn btn-primary"
            onClick={() =>
              submit('invoice-matches', {
                invoice_id: id,
                source_row: values[id] === 'none' ? null : Number(values[id]),
              })
            }
          > {tr("Confirm match")} </button>
        </div>
      ))}
      {Object.keys(report.payment_patterns).length > 0 && (
        <table className="table section">
          <caption>{tr("Payment timing from matched invoices")}</caption>
          <thead>
            <tr>
              <th>{tr("Counterparty")}</th>
              <th>{tr("Late payments / matched")}</th>
              <th>{tr("Median delay")}</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(report.payment_patterns).map(([party, p]) => (
              <tr key={party}>
                <td>{party}</td>
                <td>
                  {p.late_payments} / {p.payments}
                </td>
                <td>{p.median_delay_days} {tr("days")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

function EditCategory({ transaction, close, onSaved }) {
  const { t: tr } = usePreferences();
  const { submit, busy } = useApp();
  const [value, setValue] = useState(transaction.category);
  const [future, setFuture] = useState(false);
  return (
    <form
      className="controls"
      onSubmit={async (e) => {
        e.preventDefault();
        if (
          await submit('categories', {
            source_row: transaction.source_row,
            category: value.trim(),
            future,
          })
        )
          onSaved(value.trim());
      }}
    >
      <label> {tr("Category for row")} {transaction.source_row}
        <input required maxLength={100} value={value} onChange={(e) => setValue(e.target.value)} />
      </label>
      <label>
        <input type="checkbox" checked={future} onChange={(e) => setFuture(e.target.checked)} />{' '} {tr("Apply to this payment type after the cutoff")} </label>
      <button
        className="btn btn-primary"
        disabled={busy || !value.trim() || (value.trim() === transaction.category && !future)}
      > {tr("Save category")} </button>
      <button type="button" className="btn btn-ghost" onClick={close}> {tr("Cancel")} </button>
    </form>
  );
}

export default function Transactions() {
  const { t: tr, money: eur } = usePreferences();
  const { state } = useApp();
  const [type, setType] = useState('');
  const [category, setCategory] = useState('');
  const [search, setSearch] = useState('');
  const [notice, setNotice] = useState('');
  const [editing, setEditing] = useState(null);
  const [page, setPage] = useState(0);
  const period = usePeriod();
  const rows = period.rows.filter(
    (t) =>
      (!type || type === t.kind) &&
      (!category || category === t.category) &&
      (t.reference + ' ' + t.counterparty).toLowerCase().includes(search.toLowerCase()),
  );
  const pages = Math.max(1, Math.ceil(rows.length / 50));
  const current = Math.min(page, pages - 1);
  const offset = current * 50;
  return (
    <>
      <InvoiceReview key={state.revision} />
      <section className="card mb-4">
        <div className="card-title">{tr("Account history")}</div>
        <BalanceChart neutral points={period.points} />
        <div className="controls">
          <label> {tr("Payment type")} <select
              aria-label={tr("Payment type")}
              value={type}
              onChange={(e) => {
                setType(e.target.value);
                setPage(0);
                setEditing(null);
              }}
            >
              <option value="">{tr("All types")}</option>
              {[...new Set(period.rows.map((t) => t.kind))].sort().map((k) => (
                <option key={k} value={k}>{tr(k)}</option>
              ))}
            </select>
          </label>
          <label> {tr("Category")} <select
              aria-label={tr("Category")}
              value={category}
              onChange={(e) => {
                setCategory(e.target.value);
                setPage(0);
                setEditing(null);
              }}
            >
              <option value="">{tr("All categories")}</option>
              {Object.entries(period.rows.reduce((totals, row) => { totals[row.category] = (totals[row.category] || 0) + Number(row.amount_eur); return totals; }, {}))
                .sort()
                .map(([k, sum]) => (
                  <option key={k} value={k}>
                    {tr(k)} · {eur(sum)}
                  </option>
                ))}
            </select>
          </label>
          <label> {tr("Search reference or counterparty")} <input
              type="search"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(0);
                setEditing(null);
              }}
            />
          </label>
        </div>
      </section>
      <section className="card">
        <div className="card-title">{tr("Account activity ·")} {rows.length} {tr("payments")}</div>
        <p className="card-sub">
          {rows.length} {tr("matching payments in the selected statement period.")} </p>
        <p role="status">{notice}</p>
        <table className="table">
          <thead>
            <tr>
              <th className="date-cell">{tr("Value date")}</th>
              <th>{tr("Category")}</th>
              <th>{tr("Reference")}</th>
              <th>{tr("Counterparty")}</th>
              <th>{tr("Amount")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(offset, offset + 50).map((t) => (
              <React.Fragment key={t.source_row}>
                <tr>
                  <td className="date-cell">{t.value_on}</td>
                  <td>
                    <button
                      disabled={t.booked_on > state.settings.as_of || t.value_on > state.settings.as_of}
                      className="btn btn-ghost"
                      onClick={() => {
                        setNotice('');
                        setEditing(t);
                      }}
                    >
                      {tr(t.category)}
                    </button>
                  </td>
                  <td>{t.reference}</td>
                  <td>{t.counterparty}</td>
                  <td className={Number(t.amount) < 0 ? 'amount-neg' : 'amount-pos'}>
                    {t.amount} {t.currency}
                  </td>
                </tr>
                {editing?.source_row === t.source_row && (
                  <tr>
                    <td colSpan={5}>
                      <EditCategory
                        transaction={t}
                        close={() => setEditing(null)}
                        onSaved={(name) => {
                          setEditing(null);
                          setNotice(tr("Row") + ' ' + t.source_row + ' ' + tr("saved as") + ' ' + name + '.');
                          if (category) setCategory(name);
                        }}
                      />
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
        {pages > 1 && (
          <nav aria-label={tr("Payment pages")} className="controls pagination">
            <button
              className="btn btn-ghost"
              disabled={!current}
              onClick={() => {
                setPage(current - 1);
                setEditing(null);
              }}
            > {tr("Previous 50")} </button>
            <span> {tr("Page")} {current + 1} {tr("of")} {pages}
            </span>
            <button
              className="btn btn-ghost"
              disabled={current + 1 === pages}
              onClick={() => {
                setPage(current + 1);
                setEditing(null);
              }}
            > {tr("Next 50")} </button>
          </nav>
        )}
      </section>
    </>
  );
}
