import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { api } from '../lib/api';

const AppContext = createContext();

export function AppProvider({ children }) {
  const [actions, setActions] = useState([]);
  const [toast, setToast] = useState(null);
  const [forecast, setForecast] = useState(null);
  const [rec, setRec] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [health, setHealth] = useState(null);

  const showToast = useCallback((msg, kind = 'success') => {
    setToast({ msg, kind, id: Date.now() });
    setTimeout(() => setToast(null), 3500);
  }, []);

  const logAction = useCallback((action) => {
    setActions((prev) => [...prev, { ...action, id: Date.now(), timestamp: new Date().toISOString() }]);
  }, []);

  // One forecast + one recommendation, shared by Dashboard and Liquidity (single source of truth).
  const run = useCallback(async (opts) => {
    setLoading(true); setError(null);
    try {
      const fc = await api.runForecast(opts);
      setForecast(fc);
      setRec(await api.getRecommendation(fc));
    } catch {
      setError('Could not calculate the forecast. Check your connection and try again.');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { run(); api.health().then(setHealth).catch(() => setHealth(null)); }, [run]);

  return (
    <AppContext.Provider value={{ actions, logAction, toast, showToast, forecast, rec, setRec, loading, error, run, health }}>
      {children}
      {toast && <div className={`toast ${toast.kind === 'error' ? 'error' : toast.kind === 'warn' ? 'warn' : ''}`}>{toast.msg}</div>}
    </AppContext.Provider>
  );
}

export const useApp = () => useContext(AppContext);
