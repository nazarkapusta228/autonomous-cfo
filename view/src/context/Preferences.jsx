import React, { createContext, useContext, useEffect, useState } from 'react';
import polish from '../lib/polish.json';

const Context = createContext(null);
const defaults = { language: 'en', theme: 'dark', size: 'medium', currency: 'EUR', rate: '', low: true, change: true, approval: true };
const key = 'cfo.preferences.v1';

export function Preferences({ children }) {
  const [prefs, setPrefs] = useState(() => {
    try { return { ...defaults, ...JSON.parse(localStorage.getItem(key)) }; }
    catch { return defaults; }
  });
  const update = (values) => setPrefs(previous => ({ ...previous, ...values }));
  useEffect(() => {
    document.documentElement.lang = prefs.language;
    document.documentElement.dataset.theme = prefs.theme;
    document.documentElement.dataset.size = prefs.size;
    try { localStorage.setItem(key, JSON.stringify(prefs)); } catch {}
  }, [prefs]);
  const t = (english, pl) => prefs.language === 'pl' ? (pl ?? polish[english] ?? english) : english;
  const locale = prefs.language === 'pl' ? 'pl-PL' : 'en-IE';
  const money = (eur, compact = false) => new Intl.NumberFormat(locale, {
    style: 'currency', currency: prefs.currency, ...(compact ? { notation: 'compact' } : {}),
  }).format(Number(eur) * (prefs.currency === 'EUR' ? 1 : Number(prefs.rate)));
  return <Context.Provider value={{ prefs, update, t, money, locale }}>{children}</Context.Provider>;
}

export const usePreferences = () => useContext(Context);

