import React from 'react';

export default function Header({ title, subtitle }) {
  return (
    <header className="header">
      <div>
        <h2>{title}</h2>
        <div className="subtitle">{subtitle}</div>
      </div>
      <div className="user-chip">
        <div className="user-avatar">CF</div>
        <div>
          <span>Workspace owner</span>
          <small>CFO dashboard</small>
        </div>
      </div>
    </header>
  );
}
