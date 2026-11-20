import React from 'react';

export default function ApprovalModal({ title, description, onApprove, onCancel, confirmLabel }) {
  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h3>{title}</h3>
        <p>{description}</p>
        <div className="rec-block" style={{ marginBottom: 0 }}>
          <h4 style={{ fontSize: 12 }}>⚠ Human-in-the-loop approval</h4>
          <p style={{ fontSize: 12 }}>
            This action will be logged to the audit trail. In this demo, no real financial
            transaction will be executed — all executions are simulated.
          </p>
        </div>
        <div className="modal-actions">
          <button className="btn btn-ghost" onClick={onCancel}>Cancel</button>
          <button className="btn btn-primary" onClick={onApprove}>{confirmLabel || 'Approve'}</button>
        </div>
      </div>
    </div>
  );
}