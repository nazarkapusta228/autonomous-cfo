import React from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { eur } from '../lib/api';

export default function BalanceChart({ points, action, reserve }) {
  const data = points.map((p, i) => ({
    day: p.day,
    Balance: Number(p.balance),
    ...(action ? { 'With action': Number(action[i].balance) } : {}),
  }));
  return (
    <div className="chart-wrap">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ left: 8, right: 18, top: 12 }}>
          <CartesianGrid stroke="#24305a" strokeDasharray="3 3" />
          <XAxis dataKey="day" tickFormatter={(v) => v.slice(5)} minTickGap={28} />
          <YAxis tickFormatter={(v) => '€' + (v / 1000).toFixed(1) + 'k'} />
          <Tooltip formatter={(v) => eur(v)} contentStyle={{ background: '#172042' }} />
          <ReferenceLine y={Number(reserve ?? 0)} stroke="#ff6b6b" strokeDasharray="4 4" />
          <Line
            dataKey="Balance"
            type="linear"
            stroke="#ffcc00"
            dot={false}
            isAnimationActive={false}
          />
          {action && (
            <Line
              dataKey="With action"
              type="linear"
              stroke="#3ddc97"
              dot={false}
              isAnimationActive={false}
            />
          )}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
