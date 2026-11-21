import { usePreferences } from '../context/Preferences';
import {useApp} from '../context/AppContext';
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


export default function BalanceChart({ points, action, actionLabel, reserve, centered = false, neutral = false, forecast = false }) {
  const { t: tr, money: eur } = usePreferences();
  const gradient = useId().replace(/:/g, '');
  const {state}=useApp();
  const scale=forecast && state.daily_error_scale;
  const bounds=(p)=> {
    if(!scale) return {};
    const days=Math.max(0,(Date.parse(p.day)-Date.parse(state.settings.as_of))/86400000);
    const width=1.644853627 * scale * Math.sqrt(days);
    return {lower:Number(p.balance)-width,upper:Number(p.balance)+width};
  };
  const data = points.map((p, i) => ({
    day: p.day,
    ...bounds(p),
    Balance: Number(p.balance),
    ...(action ? { 'With action': Number(action[i].balance) } : {}),
  }));
  if (!data.length) return <p>{tr("No balances in this period.")}</p>;
  const balances = data.map((p) => p.Balance);
  const low = Math.min(...balances);
  const high = Math.max(...balances);
  const firstNegative = data.find((p) => p.Balance < 0);
  const all = action ? balances.concat(data.map((p) => p['With action'])) : balances;
  if(scale) { for(const p of data) all.push(p.lower,p.upper); }
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
        {forecast && <small>{scale ? tr('Dashed limits: approximate 90% baseline prediction interval, assuming independent daily errors.', 'Linie przerywane: przybliżony 90% przedział predykcji bazowej przy niezależnych błędach dziennych.') : tr('Insufficient variability or history for a prediction interval.', 'Za mało historii lub zmienności do obliczenia przedziału predykcji.')}</small>}
        {firstNegative && (
          <strong className={neutral ? 'chart-alert neutral-alert' : 'chart-alert'}> {tr("First below zero:")} {firstNegative.day} ({eur(firstNegative.Balance)})
          </strong>
        )}
      </figcaption>
      <div className="chart-wrap">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} accessibilityLayer margin={{ left: 0, right: centered ? axisWidth : 16, top: 14 }}>
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
            {scale && ['upper','lower'].map(k=><Line key={k} dataKey={k} name={k==='upper'?tr('Upper 90% limit','Górna granica 90%'):tr('Lower 90% limit','Dolna granica 90%')} stroke="var(--text-muted)" strokeWidth={1.25} strokeDasharray="3 5" dot={false} activeDot={false} isAnimationActive={false}/>)}
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
