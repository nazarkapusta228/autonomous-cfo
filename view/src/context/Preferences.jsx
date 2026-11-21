import React, { createContext, useContext, useEffect, useState } from 'react';
import { useExchangeRates } from '../lib/exchangeRates';
import polish from '../lib/polish.json';

const Context = createContext(null);
const defaults = { language: 'en', theme: 'dark', size: 'medium', currency: 'EUR', low: true, change: true, approval: true };
const key = 'cfo.preferences.v1';

export function Preferences({ children }) {
  const [prefs, setPrefs] = useState(() => {
    try { return { ...defaults, ...JSON.parse(localStorage.getItem(key)) }; }
    catch { return defaults; }
  });
  const exchange = useExchangeRates();
  const rate = prefs.currency === 'EUR' ? 1 : exchange.table?.rates[prefs.currency];
  const update = (values) => setPrefs(previous => ({ ...previous, ...values }));
  useEffect(() => {
    document.documentElement.lang = prefs.language;
    document.documentElement.dataset.theme = prefs.theme;
    document.documentElement.dataset.size = prefs.size;
    try { localStorage.setItem(key, JSON.stringify(prefs)); } catch {}
  }, [prefs]);
  const t = (english, pl) => prefs.language === 'pl' ? (pl ?? polish[english] ?? english) : english;
  const locale = prefs.language === 'pl' ? 'pl-PL' : 'en-IE';
  const originalMoney = (amount, currency, compact = false) => new Intl.NumberFormat(locale, {
    style: 'currency', currency, currencyDisplay: 'narrowSymbol',
    ...(compact ? { notation: 'compact', maximumFractionDigits: 1 } : {}),
  }).format(Number(amount)).replace(/ /g, '\u00a0');
  const money = (amount, compact = false) => originalMoney(
    Number(amount) * (rate ?? 1), rate ? prefs.currency : 'EUR', compact,
  );
  return <Context.Provider value={{ prefs, update, t, money, originalMoney, locale, exchange }}>{children}</Context.Provider>;
}

export const usePreferences = () => useContext(Context);

