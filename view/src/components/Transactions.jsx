import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { eur } from '../lib/api';
import BalanceChart from './BalanceChart';

function InvoiceReview() {
  const { state, busy, submit } = useApp();
  const report = state.analysis.reconciliation;
  const [values, setValues] = useState({});
  if (!state.has_invoices) return null;
  return (
    <section className="card mb-4">
      <div className="card-title">Invoice reconciliation</div>
      <p>
        {Object.keys(report.settled).length} settled · {report.outstanding.length} outstanding
      </p>
      {Object.entries(report.settled).map(([invoice, row]) => (
        <p key={invoice}>
          {invoice} · Settled by statement row {row}
        </p>
      ))}
      {report.outstanding.map((i) => (
        <p key={i.invoice_id}>
          {i.invoice_id} · {i.counterparty} · Due {i.due_on} · {eur(i.amount_eur)}
          {report.unprojected_receivables.includes(i.invoice_id) &&
            ' · Excluded from projected receipts'}
        </p>
      ))}
      {Object.entries(report.ambiguous).map(([id, rows]) => (
        <div className="controls" key={id}>
          <label>
            Match invoice {id}
            <select
              aria-label={'Match invoice ' + id}
              value={values[id] ?? ''}
              onChange={(e) => setValues({ ...values, [id]: e.target.value })}
            >
              <option value="">Choose a match</option>
              <option value="none">Keep outstanding</option>
              {rows.map((r) => {
                const t = state.transactions.find((t) => t.source_row === r);
                return (
                  <option key={r} value={r}>
                    Row {r} · {t?.value_on} · {t?.reference}
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
          >
            Confirm match
          </button>
        </div>
      ))}
      {Object.entries(report.payment_patterns).map(([party, p]) => (
        <p key={party}>
          {party} · {p.late_payments}/{p.payments} late · median delay {p.median_delay_days} days
        </p>
      ))}
    </section>
  );
}

function EditCategory({ transaction, close }) {
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
            category: value,
            future,
          })
        )
          close();
      }}
    >
      <label>
        Category for row {transaction.source_row}
        <input required maxLength={100} value={value} onChange={(e) => setValue(e.target.value)} />
      </label>
      <label>
        <input type="checkbox" checked={future} onChange={(e) => setFuture(e.target.checked)} />{' '}
        Apply to this payment type after the cutoff
      </label>
      <button className="btn btn-primary" disabled={busy}>
        Save category
      </button>
      <button type="button" className="btn btn-ghost" onClick={close}>
        Cancel
      </button>
    </form>
  );
}

export default function Transactions() {
  const { state } = useApp();
  const [type, setType] = useState('');
  const [category, setCategory] = useState('');
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState(null);
  const [limit, setLimit] = useState(50);
  const rows = state.transactions.filter(
    (t) =>
      (!type || type === t.kind) &&
      (!category || category === t.category) &&
      (t.reference + ' ' + t.counterparty).toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <>
      <InvoiceReview key={state.revision} />
      <section className="card mb-4">
        <div className="card-title">Account history</div>
        {state.history.length ? (
          <BalanceChart points={state.history} />
        ) : (
          <p>No booked entries at this cutoff.</p>
        )}
        <div className="controls">
          <label>
            Payment type
            <select
              aria-label="Payment type"
              value={type}
              onChange={(e) => setType(e.target.value)}
            >
              <option value="">All types</option>
              {[...new Set(state.transactions.map((t) => t.kind))].sort().map((k) => (
                <option key={k}>{k}</option>
              ))}
            </select>
          </label>
          <label>
            Category
            <select
              aria-label="Category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              <option value="">All categories</option>
              {Object.entries(state.categories)
                .sort()
                .map(([k, sum]) => (
                  <option key={k} value={k}>
                    {k} · {eur(sum)}
                  </option>
                ))}
            </select>
          </label>
          <label>
            Search reference or counterparty
            <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} />
          </label>
        </div>
      </section>
      <section className="card">
        <div className="card-title">Account activity · {rows.length} payments</div>
        {editing && (
          <EditCategory
            key={editing.source_row}
            transaction={editing}
            close={() => setEditing(null)}
          />
        )}
        <table className="table">
          <thead>
            <tr>
              <th>Value date</th>
              <th>Category</th>
              <th>Reference</th>
              <th>Counterparty</th>
              <th>Amount</th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, limit).map((t) => (
              <tr key={t.source_row}>
                <td>{t.value_on}</td>
                <td>
                  <button className="btn btn-ghost" onClick={() => setEditing(t)}>
                    {t.category}
                  </button>
                </td>
                <td>{t.reference}</td>
                <td>{t.counterparty}</td>
                <td>
                  {t.amount} {t.currency}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length > limit && (
          <button className="btn btn-ghost" onClick={() => setLimit(limit + 50)}>
            Show more payments
          </button>
        )}
      </section>
    </>
  );
}
