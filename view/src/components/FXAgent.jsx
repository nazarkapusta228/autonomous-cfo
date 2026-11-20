import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { fxExposure } from '../utils/analytics';
import { transactions as allTx, fxRates } from '../data/transactions';
import ApprovalModal from './ApprovalModal';
import { Coins, ShieldCheck, ArrowRight } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

export default function FXAgent() {
  const [modal, setModal] = useState(false);
  const { logAction, showToast } = useApp();
  const fx = fxExposure();

  const chfTx = allTx.filter(t => t.currency === 'CHF');

  const rateHistory = [
    { month: 'Jul', rate: 1.032 }, { month: 'Aug', rate: 1.038 },
    { month: 'Sep', rate: 1.041 }, { month: 'Oct', rate: 1.044 },
    { month: 'Nov', rate: 1.049 }, { month: 'Dec', rate: 1.047 }
  ];

  const handleApprove = () => {
    logAction({
      agent: 'FX',
      type: 'FX_FORWARD_BOOKED',
      detail: 'EUR/CHF forward @ 1.052 for €4,362 notional · 3 months',
      status: 'APPROVED'
    });
    showToast('✓ FX forward booked (simulated). Locked EUR/CHF @ 1.052');
    setModal(false);
  };

  return (
    <div>
      <div className="grid-2 mb-4">
        <div className="card">
          <div className="card-title">Currency Exposure</div>
          <div className="card-sub">Identified from foreign invoices on Commerzbank account</div>

          <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)', marginBottom: 16 }}>
            <div className="kpi" style={{ padding: 14 }}>
              <div className="kpi-label">CHF Exposure</div>
              <div className="kpi-value" style={{ fontSize: 20 }}>{fx.netChf.toFixed(2)} CHF</div>
            </div>
            <div className="kpi" style={{ padding: 14 }}>
              <div className="kpi-label">EUR Equivalent</div>
              <div className="kpi-value" style={{ fontSize: 20 }}>€ {Math.abs(fx.chfEquivEur).toFixed(2)}</div>
            </div>
            <div className="kpi" style={{ padding: 14 }}>
              <div className="kpi-label">Spot EUR/CHF</div>
              <div className="kpi-value" style={{ fontSize: 20 }}>1.047</div>
            </div>
          </div>

          <div className="chart-wrap" style={{ height: 180 }}>
            <ResponsiveContainer>
              <LineChart data={rateHistory}>
                <CartesianGrid stroke="#24305a" strokeDasharray="3 3" />
                <XAxis dataKey="month" tick={{ fill: '#8a96c0', fontSize: 11 }} />
                <YAxis domain={[1.02, 1.06]} tick={{ fill: '#8a96c0', fontSize: 11 }} tickFormatter={v => v.toFixed(3)} />
                <Tooltip
                  contentStyle={{ background: '#172042', border: '1px solid #24305a', borderRadius: 8 }}
                  formatter={v => v.toFixed(3)}
                />
                <Line type="monotone" dataKey="rate" stroke="#6ea8ff" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card">
          <div className="card-title">Agent Recommendation</div>
          <div className="card-sub">Structured hedge proposal</div>

          <div className="rec-block">
            <h4><Coins size={14} style={{ marginRight: 6, verticalAlign: -2 }} /> Risk assessment</h4>
            <p>
              Monthly CHF obligation of <strong>4,166.67 CHF</strong> for the silent partner tranche.
              At spot 1.047 the EUR cost is €4,362. A 2% adverse move (spot to 1.026) would increase
              the EUR outflow by roughly <strong>€87 per month</strong>, or <strong>€1,044 per year</strong>.
            </p>
          </div>

          <div className="rec-block" style={{ background: 'rgba(61,220,151,.05)', borderColor: 'rgba(61,220,151,.25)' }}>
            <h4 style={{ color: 'var(--success)' }}>
              <ShieldCheck size={14} style={{ marginRight: 6, verticalAlign: -2 }} /> Proposed hedge
            </h4>
            <p>
              Book a <strong>3-month EUR/CHF forward</strong> via Commerzbank FX Desk at <strong>1.052</strong> to lock
              the December + next 2 tranches. Notional: <strong>€4,362</strong>. Cost: <strong>€0 upfront</strong>
              (spread embedded). Protects cash flow against CHF appreciation.
            </p>
            <ul>
              <li>Alternative: 1-month rolling forward (more flexible, slightly higher spread)</li>
              <li>Alternative: FX option collar — better if CHF weakens further</li>
            </ul>
          </div>

          <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }} onClick={() => setModal(true)}>
            <ShieldCheck size={16} /> Approve FX forward (simulation)
          </button>
        </div>
      </div>

      <div className="card mb-4">
        <div className="card-title">Foreign Currency Transactions</div>
        <div className="card-sub">Detected automatically from account statements</div>
        <table className="table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Type</th>
              <th>Counterparty</th>
              <th>Currency</th>
              <th>Amount</th>
              <th>EUR Equiv (spot)</th>
            </tr>
          </thead>
          <tbody>
            {chfTx.map((t, i) => (
              <tr key={i}>
                <td>{t.date}</td>
                <td><span className="badge badge-sim">{t.type}</span></td>
                <td>{t.counterparty}</td>
                <td>{t.currency}</td>
                <td className="amount-neg">{t.amount.toFixed(2)}</td>
                <td>€ {(t.amount * fxRates.CHF).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal && (
        <ApprovalModal
          title="Approve FX Forward Booking"
          description="You are about to book a 3-month EUR/CHF forward contract at 1.052 with Commerzbank FX Desk. This is a simulation — no real booking will be made."
          onApprove={handleApprove}
          onCancel={() => setModal(false)}
          confirmLabel="Book & simulate"
        />
      )}
    </div>
  );
}