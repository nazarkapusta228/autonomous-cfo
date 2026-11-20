import React, { useState } from 'react';
import BalanceChart from './BalanceChart';
import DateField from './DateField';

function periodStart(last, months) {
  const end = new Date(last + 'T00:00:00Z');
  const first = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - months, 1));
  const days = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  first.setUTCDate(Math.min(end.getUTCDate(), days) + 1);
  return first.toISOString().slice(0, 10);
}

export default function StatementHistory({ points }) {
  const first = points[0]?.day,
    last = points.at(-1)?.day;
  const [start, setStart] = useState(first);
  const [end, setEnd] = useState(last);
  if (!first) return <p>No booked entries in the statement.</p>;
  const selected = points.filter((p) => p.day >= start && p.day <= end);
  return (
    <>
      <p className="card-sub">
        Daily closing balance across the full imported statement. Periods end on the last statement
        date, {last}.
      </p>
      <div className="controls period-picker">
        {[
          ['Full statement', 0],
          ['Last year', 12],
          ['Last month', 1],
        ].map(([label, months]) => {
          const from = months ? periodStart(last, months) : first;
          const clipped = from < first ? first : from;
          return (
            <button
              key={label}
              type="button"
              className="btn btn-ghost"
              aria-pressed={start === clipped && end === last}
              onClick={() => {
                setStart(clipped);
                setEnd(last);
              }}
            >
              {label}
            </button>
          );
        })}
      </div>
      <div className="controls">
        <DateField
          label="Chart start date"
          min={first}
          max={last}
          value={start}
          onChange={setStart}
        />
        <DateField label="Chart end date" min={first} max={last} value={end} onChange={setEnd} />
      </div>
      {!start || !end || start > end || start < first || end > last ? (
        <p role="status">
          Choose an ordered date range within {first} – {last}.
        </p>
      ) : (
        <BalanceChart neutral points={selected} />
      )}
    </>
  );
}
