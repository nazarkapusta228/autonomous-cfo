// One interface, two implementations. UI never knows which one it talks to.
// VITE_USE_MOCK=false  ->  real FastAPI backend (same JSON shapes, money as Decimal strings -> toCents()).
import { runForecast, eur } from './forecast';
import { DEMO } from './demo';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const KEY = 'cfo.db.v1';
const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) ?? { recs: {}, audit: [] }; } catch { return { recs: {}, audit: [] }; } };
const save = (db) => { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch { /* storage unavailable: state lives for this session only */ } };

const mock = {
  async health() { return { app: 'ok', db: 'mock', model: 'mock' }; },

  async runForecast({ asOf = DEMO.asOf, reserveCents = 0, horizon = 45 } = {}) {
    await wait(400);
    return runForecast({ ...DEMO, asOf, reserveCents, horizon });
  },

  // Code decides action / amount / date. The model (here: a template) only explains.
  async getRecommendation(fc) {
    await wait(700);
    const db = load();
    const id = 'rec_' + fc.id; // same forecast => same recommendation (idempotent)
    if (db.recs[id]) return db.recs[id];
    const need = fc.fundingNeeded;
    const rec = need > 0
      ? { id, forecastId: fc.id, action: 'propose_credit', amount: Math.ceil(need / 50000) * 50000, neededBy: fc.firstNegative,
          explanation: `Your balance drops to ${eur(fc.minBalance)} on ${fc.minDate}. ${fc.drivers.map((d) => d.label).join(', ')} fall due while revenue is low.`,
          risks: ['Short-term credit has interest cost', 'Forecast is based on assumed revenue'], llmStatus: 'mock', status: 'pending' }
      : { id, forecastId: fc.id, action: 'hold', amount: 0, neededBy: null, explanation: 'Cash covers all planned payments.', risks: [], llmStatus: 'mock', status: 'info' };
    db.recs[id] = rec; save(db);
    return rec;
  },

  async decide(id, decision) { // 'approved' | 'rejected' — only legal from 'pending'
    await wait(500);
    const db = load(); const rec = db.recs[id];
    if (!rec) throw new Error('not_found');
    if (rec.status !== 'pending') return rec; // double click / reload: no second request
    rec.status = decision;
    if (decision === 'approved') rec.simulation = { requestNo: 'SIM-' + String(db.audit.length + 1).padStart(4, '0'), simulated: true };
    db.audit.push({ at: new Date().toISOString(), recId: id, event: decision.toUpperCase(), amount: rec.amount });
    save(db);
    return rec;
  },
  approve(id) { return this.decide(id, 'approved'); },
  reject(id) { return this.decide(id, 'rejected'); },
  async audit() { return load().audit; },
};

const http = (p, o) => fetch('/api' + p, { headers: { 'Content-Type': 'application/json' }, ...o }).then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); });
const real = {
  health: () => http('/health'),
  runForecast: (b) => http('/forecast', { method: 'POST', body: JSON.stringify(b) }),
  getRecommendation: (fc) => http(`/forecast/${fc.id}/recommendation`, { method: 'POST' }),
  approve: (id) => http(`/recommendations/${id}/approve`, { method: 'POST' }),
  reject: (id) => http(`/recommendations/${id}/reject`, { method: 'POST' }),
  audit: () => http('/audit'),
};

export const api = import.meta.env.VITE_USE_MOCK === 'false' ? real : mock;
