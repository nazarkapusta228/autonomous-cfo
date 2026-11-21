import React, { useEffect, useRef } from 'react';
import { faMagnifyingGlass } from '@fortawesome/free-solid-svg-icons/faMagnifyingGlass';
import { usePreferences } from '../context/Preferences';

export function InspectTax({ label, onClick }) {
  const [w, h, , , path] = faMagnifyingGlass.icon;
  return (
    <button
      className="btn btn-ghost inspect-tax"
      aria-label={label}
      title={label}
      onClick={onClick}
    >
      <svg
        aria-hidden="true"
        width="15"
        height="15"
        viewBox={'0 0 ' + w + ' ' + h}
      >
        <path d={path} fill="currentColor" />
      </svg>
    </button>
  );
}
export function TaxDetails({ row, booked, close }) {
  const { t, money, originalMoney } = usePreferences(),
    dialog = useRef(null);
  useEffect(() => {
    const el = dialog.current;
    el.showModal();
    return () => el.close();
  }, []);
  const fields = booked
    ? [
        [
          t('Booked amount', 'Zaksięgowana kwota'),
          originalMoney(row.amount, row.currency),
        ],
        [
          t('EUR at booking', 'Równowartość w EUR'),
          originalMoney(row.amount_eur, 'EUR'),
        ],
        [t('Booking date', 'Data księgowania'), row.booked_on],
        [t('Value date'), row.value_on],
        [t('Payment type'), row.kind],
        [t('Counterparty'), row.counterparty],
        [t('Reference'), row.reference],
        [t('Statement row', 'Wiersz wyciągu'), row.source_row],
      ]
    : [
        [t('Planned amount', 'Planowana kwota'), money(row.amount_eur)],
        [t('Date'), row.date],
        [t('Category'), row.category],
        [t('Payment'), row.description],
        ...(row.invoice_id ? [[t('Invoice'), row.invoice_id]] : []),
      ];
  return (
    <dialog
      className="message-dialog tax-details"
      aria-labelledby="tax-detail-title"
      ref={dialog}
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
    >
      <h3 id="tax-detail-title">
        {booked
          ? t('Bank-booked tax payment', 'Zaksięgowana płatność podatkowa')
          : t('Planned tax payment', 'Planowana płatność podatkowa')}
      </h3>
      <dl>
        {fields.map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{v || '—'}</dd>
          </div>
        ))}
      </dl>
      <button autoFocus className="btn btn-primary" onClick={close}>
        {t('Close')}
      </button>
    </dialog>
  );
}
