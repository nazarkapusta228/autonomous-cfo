import { transactions, openingBalance, upcomingObligations } from '../data/transactions';

export function totalRevenue() {
  return transactions.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0);
}

export function totalExpenses() {
  return transactions.filter(t => t.amount < 0).reduce((s, t) => s + t.amount, 0);
}

export function currentBalance() {
  const total = transactions.reduce((s, t) => s + t.amount, 0);
  return openingBalance + total;
}

export function averageDailyBurn() {
  const sorted = [...transactions].sort((a, b) => new Date(a.date) - new Date(b.date));
  const days = 22;
  const net = transactions.reduce((s, t) => s + t.amount, 0);
  return Math.abs(net) / days;
}

export function averageDailyInflow() {
  const inflow = transactions.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0);
  return inflow / 22;
}

export function forecastCashflow(days = 30) {
  const dailyNet = transactions.reduce((s, t) => s + t.amount, 0) / 22;
  const dailyInflow = averageDailyInflow();
  let balance = currentBalance();
  const series = [];
  const today = new Date('2025-12-31');
  for (let i = 0; i <= days; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    balance += dailyNet;
    series.push({
      day: i,
      date: d.toISOString().slice(0, 10),
      balance: Math.round(balance * 100) / 100
    });
  }
  return series;
}

export function forecastObligations(days = 45) {
  let balance = currentBalance();
  const dailyNet = transactions.reduce((s, t) => s + t.amount, 0) / 22;
  const series = [];
  const today = new Date('2025-12-31');
  for (let i = 0; i <= days; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    const iso = d.toISOString().slice(0, 10);
    balance += dailyNet;
    const dueToday = upcomingObligations
      .filter(o => o.due === iso)
      .reduce((s, o) => s + o.amount, 0);
    if (dueToday > 0) balance -= dueToday;
    series.push({
      day: i,
      date: iso,
      balance: Math.round(balance * 100) / 100,
      obligation: dueToday
    });
  }
  return series;
}

export function projectedLowestBalance(days = 30) {
  const series = forecastCashflow(days);
  return Math.min(...series.map(s => s.balance));
}

export function fxExposure() {
  const chf = transactions.filter(t => t.currency === 'CHF');
  const netChf = chf.reduce((s, t) => s + t.amount, 0);
  return {
    netChf,
    chfEquivEur: netChf * 1.047,
    monthlyObligationEur: 4362
  };
}

export function taxPosition() {
  const taxPaid = transactions
    .filter(t => t.type === 'TAX OFFICE TRANSFER' || t.ref.includes('Tax') || t.ref.includes('SEPA Direct Debit Income Tax'))
    .reduce((s, t) => s + t.amount, 0);
  return {
    taxPaid: Math.abs(taxPaid),
    nextObligation: 2030,
    estimatedAnnualProfit: 42000
  };
}

export function availableForInvestment() {
  const balance = currentBalance();
  const buffer = projectedLowestBalance(45);
  const safe = balance + Math.min(0, buffer);
  return Math.max(0, Math.round(balance - Math.max(0, -buffer) - 2000));
}

export function monthlyAggregate() {
  const map = {};
  transactions.forEach(t => {
    const m = t.date.slice(0, 7);
    if (!map[m]) map[m] = { month: m, inflow: 0, outflow: 0 };
    if (t.amount > 0) map[m].inflow += t.amount;
    else map[m].outflow += Math.abs(t.amount);
  });
  return Object.values(map).sort((a, b) => a.month.localeCompare(b.month));
}

export function categoryBreakdown() {
  const map = {};
  transactions.forEach(t => {
    if (t.amount < 0) {
      const key = t.type;
      map[key] = (map[key] || 0) + Math.abs(t.amount);
    }
  });
  return Object.entries(map).map(([name, value]) => ({ name, value: Math.round(value * 100) / 100 }));
}