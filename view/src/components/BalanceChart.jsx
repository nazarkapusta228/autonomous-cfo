import { usePreferences } from '../context/Preferences';
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


export default function BalanceChart({ points, action, actionLabel, reserve, neutral = false }) {
  const { t: tr, money: eur } = usePreferences();
  const gradient = useId().replace(/:/g, '');
  const data = points.map((p, i) => ({
    day: p.day,
    Balance: Number(p.balance),
    ...(action ? { 'With action': Number(action[i].balance) } : {}),
  }));
  if (!data.length) return <p>{tr("No balances in this period.")}</p>;
  const balances = data.map((p) => p.Balance);
  const low = Math.min(...balances);
  const high = Math.max(...balances);
  const firstNegative = data.find((p) => p.Balance < 0);
  const all = action ? balances.concat(data.map((p) => p['With action'])) : balances;
  const floor = Math.min(0, ...all);
  const ceiling = Math.max(0, Number(reserve ?? 0), ...all);
  const axisSamples = [floor, ceiling, floor / 3, ceiling / 3, 0];
  const fontSize = parseFloat(getComputedStyle(document.documentElement).fontSize) * 0.8125;
  const axisWidth = Math.ceil(Math.max(...axisSamples.map(value => eur(value, true).length)) * fontSize + 18);
  const split = !neutral && high > 0 && low < 0;
  const stroke = split ? `url(#${gradient})` : !neutral && low < 0 ? 'var(--danger)' : 'var(--primary)';
  return (
    <figure className="balance-figure">
      <figcaption className="chart-key">
        <span>
          <i className="key-balance" /> {tr("Balance")} </span>
        {action && (
          <span>
            <i className="key-action" /> {actionLabel || tr("With action")} </span>
        )}
        {reserve != null && (
          <span>
            <i className="key-reserve" /> {tr("Reserve")} {eur(reserve)}
          </span>
        )}
        {firstNegative && (
          <strong className={neutral ? 'chart-alert neutral-alert' : 'chart-alert'}> {tr("First below zero:")} {firstNegative.day} ({eur(firstNegative.Balance)})
          </strong>
        )}
      </figcaption>
      <div className="chart-wrap">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} accessibilityLayer margin={{ left: 0, right: 16, top: 14 }}>
            {split && (
              <defs>
                <linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1">
                  <stop offset={high / (high - low)} stopColor="var(--primary)" />
                  <stop offset={high / (high - low)} stopColor="var(--danger)" />
                </linearGradient>
              </defs>
            )}
            <CartesianGrid stroke="var(--border)" strokeDasharray="3 5" vertical={false} />
            <XAxis
              dataKey="day"
              tickFormatter={(v) => v.slice(5)}
              minTickGap={24}
              stroke="var(--text-muted)"
            />
            <YAxis
              domain={[floor, ceiling || (floor === 0 ? 1 : 0)]}
              width={axisWidth}
              tickFormatter={(v) => eur(v, true)}
              stroke="var(--text-muted)"
            />
            <Tooltip
              formatter={(v) => (
                <span className={neutral && Number(v) < 0 ? 'amount-neg' : undefined}>
                  {eur(v)}
                </span>
              )}
              contentStyle={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
              itemStyle={{ color: 'var(--text)' }}
            />
            {!neutral && floor < 0 && (
              <ReferenceArea y1={floor} y2={0} fill="var(--danger)" fillOpacity={0.16} />
            )}
            <ReferenceLine
              y={0}
              stroke="var(--text-muted)"
              strokeWidth={2}
            />
            {reserve != null && (
              <ReferenceLine
                y={Number(reserve)}
                stroke="var(--accent)"
                strokeDasharray="7 5"
                strokeWidth={2}
              />
            )}
            <Line
              dataKey="Balance" name={tr("Balance")}
              stroke={stroke}
              strokeWidth={3}
              dot={data.length === 1}
              activeDot={{ r: 5, fill: 'var(--text)' }}
              isAnimationActive={false}
            />
            {action && (
              <Line
                dataKey="With action" name={actionLabel || tr("With action")}
                stroke="var(--accent)"
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
                fill={neutral ? 'var(--primary)' : 'var(--danger)'}
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
