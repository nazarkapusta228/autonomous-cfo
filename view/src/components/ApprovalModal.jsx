import { usePreferences } from '../context/Preferences';
import React from 'react';

export default function ApprovalModal({
  title,
  description,
  onApprove,
  onCancel,
  busy,
  confirmLabel,
  blockedMessage,
  onAssess,
}) {
  const { t: tr } = usePreferences();
  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <h3>{title}</h3>
        <p>{blockedMessage || description}</p>
        {!blockedMessage && (
          <div className="rec-block" style={{ marginBottom: 0 }}>
            <h4 style={{ fontSize: 12 }}>{tr("⚠ Human-in-the-loop approval")}</h4>
            <p style={{ fontSize: 12 }}> {tr("Approval records this simulation in the workspace audit.")} </p>
          </div>
        )}
        <div className="modal-actions">
          <button className="btn btn-ghost" onClick={onCancel}>
            {blockedMessage ? tr("Close") : tr("Cancel")}
          </button>
          {onAssess && (
            <button className="btn btn-primary" disabled={busy} onClick={onAssess}> {tr("Run assessment")} </button>
          )}
          {!blockedMessage && (
            <button className="btn btn-primary" disabled={busy} onClick={onApprove}>
              {confirmLabel || tr("Approve")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
