import React, { useEffect, useRef } from 'react';
import { usePreferences } from '../context/Preferences';

export default function MessageDialog({ message, confirmation, close }) {
  const { t } = usePreferences();
  const dialog = useRef(null);
  useEffect(() => {
    const element = dialog.current;
    element.showModal();
    return () => element.close();
  }, []);
  return (
    <dialog
      ref={dialog}
      className="message-dialog"
      aria-labelledby="message-title"
      onCancel={(event) => {
        event.preventDefault();
        close(false);
      }}
    >
      <h3 id="message-title">
        {confirmation
          ? t('Confirm change', 'Potwierdź zmianę')
          : t('Request failed', 'Nie udało się wykonać operacji')}
      </h3>
      <p>{message}</p>
      <div className="modal-actions">
        <button
          autoFocus
          className="btn btn-ghost"
          onClick={() => close(false)}
        >
          {confirmation ? t('Cancel') : t('Dismiss')}
        </button>
        {confirmation && (
          <button className="btn btn-primary" onClick={() => close(true)}>
            {t('Confirm', 'Potwierdź')}
          </button>
        )}
      </div>
    </dialog>
  );
}
