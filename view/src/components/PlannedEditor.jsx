import React, { useState } from 'react';
import { usePreferences } from '../context/Preferences';
import { useApp } from '../context/AppContext';
import { nextDay } from '../lib/api';

export default function PlannedEditor({ index, close }) {
  const { state, busy, submit } = useApp(),
    { t } = usePreferences();
  const row = state.analysis.plan[index];
  return (
    <form
      className="data-tools"
      onSubmit={async (e) => {
        e.preventDefault();
        if (
          await submit('plan/edit', {
            ...Object.fromEntries(new FormData(e.currentTarget)),
            key: state.plan_keys[index],
          })
        )
          close();
      }}
    >
      {[
        [t('Date'), 'date', 'date'],
        [t('Payment'), 'description', 'text'],
        [t('Category'), 'category', 'text'],
        [t('Amount') + ' (EUR)', 'amount_eur', 'number'],
      ].map(([label, name, type]) => (
        <label key={name}>
          {label}
          <input
            name={name}
            required
            type={type}
            min={type === 'date' ? nextDay(state.settings.as_of) : undefined}
            step={type === 'number' ? '.01' : undefined}
            defaultValue={row[name]}
          />
        </label>
      ))}
      <small>{state.uses_statement_projection || row.invoice_id ? t('This edits the forecast assumption. The source booking or invoice stays as recorded.','Zmieniasz założenie prognozy. Zapis źródłowy pozostaje bez zmian.') : t('Saves to the current cash flow plan.','Zapisuje w bieżącym planie przepływów.')}</small>
      <button className="btn btn-primary" disabled={busy}>
        {t('Save forecast change', 'Zapisz zmianę prognozy')}
      </button>
      <button className="btn btn-ghost" type="button" onClick={close}>
        {t('Cancel')}
      </button>
    </form>
  );
}
