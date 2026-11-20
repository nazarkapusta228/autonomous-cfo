import React from 'react';
import { useApp } from '../context/AppContext';
import { taxPosition } from '../utils/analytics';
import { transactions as allTx } from '../data/transactions';
import { Receipt, TrendingDown, CheckCircle2 } from 'lucide-react';

export default function TaxAgent() {
  const tax = taxPosition();
  const { showToast, logAction } = useApp();

  const taxTx = allTx.filter(t =>
    t.type === 'TAX OFFICE TRANSFER' ||
    t.ref.toLowerCase().includes('tax')
  );

  const handleFile = () => {
    logAction({
      agent: 'Tax',
      type: 'ADJUSTED_PREPAYMENT_FILED',
      detail: 'Basis adjusted from €30k → €42k. Refund expected: €280',
      status: 'APPROVED'
    });
    showToast('✓ Adjusted tax prepayment filed (simulated). Refund: €280');
  };

  return (
    <div>
      <div className="grid-2 mb-4">
        <div className="card">
          <div className="card-title">Tax Position Analysis</div>
          <div className="card-sub">Agent assessment of prepayment basis</div>

          <div className="rec-block">
            <h4><Receipt size={14} style={{ marginRight: 6, verticalAlign: -2 }} /> Current situation</h4>
            <p>
              The Q4 income tax prepayment of <strong>€1,150</strong> was calculated on the
              prior-year profit basis of <strong>€30,000</strong>. However, the current year-to-date
              figures indicate actual annual profit closer to <strong>€42,000</strong>.
            </p>
            <ul>
              <li>Total tax paid in Dec: €{tax.taxPaid.toFixed(2)}</li>
              <li>Prior-year basis: €30,000</li>
              <li>Current estimate: €42,000</li>
              <li>Next prepayment: €{tax.nextObligation} due 2025-01-15</li>
            </ul>
          </div>

          <div className="rec-block" style={{ background: 'rgba(61,220,151,.05)', borderColor: 'rgba(61,220,151,.25)' }}>
            <h4 style={{ color: 'var(--success)' }}>
              <CheckCircle2 size={14} style={{ marginRight: 6, verticalAlign: -2 }} /> Optimization opportunity
            </h4>
            <p>
              Filing an adjusted basis (Bemessungsgrundlage) with the Finanzamt could yield a
              refund of approximately <strong>€280</strong> from Q4 overpayment, and correctly
              aligns the prepayment schedule going forward. The agent recommends doing this before
              the January 15 due date.
            </p>
          </div>

          <button className="btn btn-primary" onClick={handleFile} style={{ width: '100%', justifyContent: 'center' }}>
            <TrendingDown size={16} /> File adjusted prepayment (simulation)
          </button>
        </div>

        <div className="card">
          <div className="card-title">Tax Calendar</div>
          <div className="card-sub">Upcoming obligations</div>
          <table className="table">
            <thead>
              <tr>
                <th>Due</th>
                <th>Description</th>
                <th>Amount</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>2026-01-10</td>
                <td>Wage Tax 12/2025</td>
                <td className="amount-neg">- €880.00</td>
                <td><span className="badge badge-approved">PAID</span></td>
              </tr>
              <tr>
                <td>2026-01-15</td>
                <td>Income Tax Q1/2026</td>
                <td className="amount-neg">- €1,150.00</td>
                <td><span className="badge badge-pending">UPCOMING</span></td>
              </tr>
              <tr>
                <td>2026-01-15</td>
                <td>Solidarity Surcharge</td>
                <td className="amount-neg">- €0.00</td>
                <td><span className="badge badge-sim">EXEMPT</span></td>
              </tr>
              <tr>
                <td>2026-02-10</td>
                <td>Wage Tax 01/2026</td>
                <td className="amount-neg">- €880.00</td>
                <td><span className="badge badge-pending">PLANNED</span></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <div className="card-title">Historical Tax Payments</div>
        <div className="card-sub">Extracted from bank statements</div>
        <table className="table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Reference</th>
              <th>Counterparty</th>
              <th>Amount</th>
            </tr>
          </thead>
          <tbody>
            {taxTx.map((t, i) => (
              <tr key={i}>
                <td>{t.date}</td>
                <td>{t.ref}</td>
                <td>{t.counterparty}</td>
                <td className="amount-neg">{t.amount.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}