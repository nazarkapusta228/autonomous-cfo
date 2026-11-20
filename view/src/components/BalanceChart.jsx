import React, { useId } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { eur } from '../lib/api';

const axisMoney = new Intl.NumberFormat('en-IE', {
  style: 'currency',
  currency: 'EUR',
  notation: 'compact',
  maximumFractionDigits: 2,
});

export default function BalanceChart({ points, action, reserve }) {
  const gradient = useId().replace(/:/g, '');
  const data = points.map((p, i) => ({
    day: p.day,
    Balance: Number(p.balance),
    ...(action ? { 'With action': Number(action[i].balance) } : {}),
  }));
  if (!data.length) return <p>No balances in this period.</p>;
  const balances = data.map((p) => p.Balance);
  const low = Math.min(...balances);
  const high = Math.max(...balances);
  const firstNegative = data.find((p) => p.Balance < 0);
  const all = action ? balances.concat(data.map((p) => p['With action'])) : balances;
  const floor = Math.min(0, ...all);
  const ceiling = Math.max(0, Number(reserve ?? 0), ...all);
  const split = high > 0 && low < 0;
  const stroke = split ? `url(#${gradient})` : low < 0 ? '#ff8797' : '#ffdb66';
  return (
    <figure className="balance-figure">
      <figcaption className="chart-key">
        <span>
          <i className="key-balance" />
          Balance
        </span>
        {action && (
          <span>
            <i className="key-action" />
            With action
          </span>
        )}
        {reserve != null && (
          <span>
            <i className="key-reserve" />
            Reserve {eur(reserve)}
          </span>
        )}
        {firstNegative && (
          <strong className="chart-alert">
            First below zero: {firstNegative.day} ({eur(firstNegative.Balance)})
          </strong>
        )}
      </figcaption>
      <div className="chart-wrap">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} accessibilityLayer margin={{ left: 0, right: 16, top: 14 }}>
            {split && (
              <defs>
                <linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1">
                  <stop offset={high / (high - low)} stopColor="#ffdb66" />
                  <stop offset={high / (high - low)} stopColor="#ff8797" />
                </linearGradient>
              </defs>
            )}
            <CartesianGrid stroke="#526080" strokeDasharray="3 5" vertical={false} />
            <XAxis
              dataKey="day"
              tickFormatter={(v) => v.slice(5)}
              minTickGap={24}
              stroke="#ccd7ef"
            />
            <YAxis
              domain={[floor, ceiling || (floor === 0 ? 1 : 0)]}
              width={72}
              tickFormatter={(v) => axisMoney.format(v)}
              stroke="#ccd7ef"
            />
            <Tooltip
              formatter={(v) => eur(v)}
              contentStyle={{ background: '#111b32', borderColor: '#7484a6' }}
              itemStyle={{ color: '#fff' }}
            />
            {floor < 0 && <ReferenceArea y1={floor} y2={0} fill="#ff617d" fillOpacity={0.16} />}
            <ReferenceLine
              y={0}
              stroke="#edf2ff"
              strokeWidth={2}
              label={{ value: '€0', position: 'insideTopRight', fill: '#edf2ff', fontSize: 13 }}
            />
            {reserve != null && (
              <ReferenceLine
                y={Number(reserve)}
                stroke="#a9c8ff"
                strokeDasharray="7 5"
                strokeWidth={2}
              />
            )}
            <Line
              dataKey="Balance"
              stroke={stroke}
              strokeWidth={3}
              dot={data.length === 1}
              activeDot={{ r: 5, fill: '#fff' }}
              isAnimationActive={false}
            />
            {action && (
              <Line
                dataKey="With action"
                stroke="#66e8b5"
                strokeWidth={3}
                strokeDasharray="9 3"
                dot={data.length === 1}
                isAnimationActive={false}
              />
            )}
            {firstNegative && (
              <ReferenceDot
                x={firstNegative.day}
                y={firstNegative.Balance}
                r={5}
                fill="#ff7188"
                stroke="white"
                strokeWidth={2}
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </figure>
  );
}
