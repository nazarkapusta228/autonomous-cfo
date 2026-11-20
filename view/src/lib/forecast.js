// Money = integer cents. No floats anywhere in the forecast.
// Mirrors the backend contract (backend sends Decimal strings -> convert with toCents()).
const DAY = 86400000;
const addDays = (s, n) => new Date(Date.parse(s + 'T00:00:00Z') + n * DAY).toISOString().slice(0, 10);
const hash = (s) => { let h = 5381; for (const c of s) h = ((h << 5) + h + c.charCodeAt(0)) | 0; return (h >>> 0).toString(36); };

export const toCents = (decimalString) => Math.round(parseFloat(decimalString) * 100);
export const eur = (cents) => (cents / 100).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });

/** events: [{ date:'YYYY-MM-DD', label, cents }] — only the PLAN; anything dated <= asOf is ignored. */
export function runForecast({ asOf, openingCents, horizon = 45, reserveCents = 0, events }) {
  let balance = openingCents;
  const points = [];
  for (let i = 1; i <= horizon; i++) {
    const date = addDays(asOf, i);
    const day = events.filter((e) => e.date === date);
    const inflow = day.filter((e) => e.cents > 0).reduce((s, e) => s + e.cents, 0);
    const outflow = day.filter((e) => e.cents < 0).reduce((s, e) => s + e.cents, 0);
    balance += inflow + outflow;
    points.push({ date, balance, inflow, outflow, kind: 'forecast' }); // every day, also days without events
  }
  const min = points.reduce((a, p) => (p.balance < a.balance ? p : a), points[0]);
  const firstNegative = points.find((p) => p.balance < 0)?.date ?? null;
  const reserveBreach = points.find((p) => p.balance < reserveCents)?.date ?? null;
  const drivers = events
    .filter((e) => e.cents < 0 && e.date > asOf && e.date <= min.date)
    .sort((a, b) => a.cents - b.cents).slice(0, 3)
    .sort((a, b) => a.date.localeCompare(b.date));
  const input = { asOf, openingCents, horizon, reserveCents, events };
  return {
    id: 'fc_' + hash(JSON.stringify(input)), // new inputs => new id => new decision required
    asOf, openingCents, reserveCents, points, drivers,
    firstNegative, reserveBreach,
    minBalance: min.balance, minDate: min.date,
    fundingNeeded: Math.max(0, reserveCents - min.balance),
  };
}
