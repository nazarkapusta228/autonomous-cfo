// All amounts in these calculations are signed EUR cents.
export const cents = (amount) => Math.round(Number(amount) * 100);

export function operatingCost(label) {
  if (/\b(rent|lease|czynsz|miete)\b/i.test(label)) return 'rent';
  if (/payroll|salary|salaries|wynagrodze|gehalt|löhne/i.test(label))
    return 'payroll';
  return null;
}

export function monthHistory(rows, asOf) {
  const end = new Date(asOf + 'T00:00:00Z');
  const nextDay = new Date(end);
  nextDay.setUTCDate(end.getUTCDate() + 1);
  const offset = nextDay.getUTCDate() === 1 ? 0 : 1;
  const months = Array.from({ length: 12 }, (_, i) => ({
    month: new Date(
      Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - offset - 11 + i, 1),
    )
      .toISOString()
      .slice(0, 7),
    rows: 0,
    receipts: 0,
    out: 0,
    rent: 0,
    payroll: 0,
    payrollCount: 0,
    payees: new Set(),
    unnamedPayroll: false,
    categories: Object.create(null),
  }));
  const byMonth = new Map(months.map((m) => [m.month, m]));
  for (const row of rows) {
    if (row.booked_on > asOf || row.value_on > asOf) continue;
    const m = byMonth.get(row.value_on.slice(0, 7));
    if (!m) continue;
    m.rows++;
    const amount = cents(row.amount_eur);
    if (amount >= 0) {
      m.receipts += amount;
      continue;
    }
    m.out -= amount;
    const label = row.category || row.kind;
    m.categories[label] = (m.categories[label] || 0) - amount;
    const type = operatingCost(label) || operatingCost(row.kind);
    if (type) m[type] -= amount;
    if (type === 'payroll') {
      m.payrollCount++;
      const payee = row.counterparty?.trim().toLowerCase();
      if (payee) m.payees.add(payee);
      else m.unnamedPayroll = true;
    }
  }
  return months;
}

export function budgetCoverage(analysis, hasData) {
  let cash =
    cents(analysis.forecast.opening_balance) - cents(analysis.forecast.reserve);
  let worst = 100;
  const byDay = new Map();
  for (const flow of analysis.plan) {
    const total = byDay.get(flow.date) || { income: 0, due: 0 };
    const amount = cents(flow.amount_eur);
    if (amount < 0) total.due -= amount;
    else total.income += amount;
    byDay.set(flow.date, total);
  }
  if (cash < 0) worst = 0;
  for (const day of [...byDay.keys()].sort()) {
    const { income, due } = byDay.get(day);
    cash += income;
    if (due) worst = Math.min(worst, (100 * Math.max(0, cash)) / due);
    cash -= due;
  }
  return hasData ? Math.round(worst) : null;

}

export function stressForecast(
  analysis,
  rent,
  payroll,
  delay,
  receiptCategory,
) {
  const delta = new Map();
  const add = (day, amount) => delta.set(day, (delta.get(day) || 0) + amount);
  for (const flow of analysis.plan) {
    const amount = cents(flow.amount_eur);
    if (amount < 0) {
      const type =
        operatingCost(flow.category) || operatingCost(flow.description);
      const percent = type === 'rent' ? rent : type === 'payroll' ? payroll : 0;
      add(flow.date, -Math.round((-amount * percent) / 100));
    } else if (delay && flow.category === receiptCategory) {
      const day = new Date(flow.date + 'T00:00:00Z');
      day.setUTCDate(day.getUTCDate() + delay);
      add(flow.date, -amount);
      add(day.toISOString().slice(0, 10), amount);
    }
  }
  let cumulative = 0;
  return analysis.forecast.daily_balances.map((p) => {
    cumulative += delta.get(p.day) || 0;
    return { day: p.day, balance: (cents(p.balance) + cumulative) / 100 };
  });
}
