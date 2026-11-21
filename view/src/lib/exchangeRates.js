import { useEffect, useState } from 'react';

const url = 'https://api.nbp.pl/api/exchangerates/tables/A/?format=json';
const interval = 30 * 60 * 1000;

export function fromNbpTable([table]) {
  const quotes = Object.fromEntries(table.rates.map(row => [row.code, row.mid]));
  if (![quotes.EUR, quotes.USD, quotes.CHF].every(rate => Number.isFinite(rate) && rate > 0)
      || !/^\d{4}-\d{2}-\d{2}$/.test(table.effectiveDate)) throw Error('Invalid NBP table');
  return { date: table.effectiveDate, rates: {
    EUR: 1, PLN: quotes.EUR, USD: quotes.EUR / quotes.USD, CHF: quotes.EUR / quotes.CHF,
  }};
}

export function useExchangeRates() {
  const [table, setTable] = useState(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    let controller;
    async function refresh() {
      if (controller) return;
      setLoading(true);
      controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      try {
        const response = await fetch(url, { signal: controller.signal, credentials: 'omit', cache: 'no-cache' });
        if (!response.ok) throw Error('NBP unavailable');
        const next = fromNbpTable(await response.json());
        if (active) { setTable(next); setFailed(false); }
      } catch {
        if (active) setFailed(true);
      } finally {
        clearTimeout(timeout);
        controller = null;
        if (active) setLoading(false);
      }
    }
    refresh();
    const timer = setInterval(refresh, interval);
    return () => { active = false; clearInterval(timer); controller?.abort(); };
  }, [attempt]);
  return { table, failed, loading, retry: () => setAttempt(previous => previous + 1) };
}
