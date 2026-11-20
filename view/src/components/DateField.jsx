import React from 'react';

export default function DateField({ label, value, onChange, min, max, shortcuts = [] }) {
  return (
    <div className="date-field">
      <label>
        {label}
        <input
          required
          type="date"
          value={value}
          min={min}
          max={max}
          onClick={(event) => event.currentTarget.showPicker?.()}
          onChange={(event) => onChange(event.target.value)}
        />
      </label>
      <div className="date-shortcuts">
        {shortcuts
          .filter(([, date]) => date && (!min || date >= min) && (!max || date <= max))
          .map(([name, date]) => (
            <button
              type="button"
              key={name}
              className="btn btn-ghost"
              title={date}
              onClick={() => onChange(date)}
            >
              {name}
            </button>
          ))}
      </div>
    </div>
  );
}
