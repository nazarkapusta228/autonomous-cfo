import { usePreferences } from '../context/Preferences';
import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';

const AppContext = createContext();

export function AppProvider({ children }) {
  const { t: tr } = usePreferences();
  const [state, setState] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const active = useRef(false);
  const initial = useRef(null);

  async function refresh() {
    setError('');
    try {
      setState(await api('workspace'));
    } catch (e) {
      setError(e.message);
    }
  }
  useEffect(() => {
    if (!initial.current) initial.current = refresh();
  }, []);

  async function submit(path, fields = {}, reload = true) {
    if (active.current) return null;
    active.current = true;
    setBusy(true);
    setError('');
    try {
      const result = await api(path, { ...fields, revision: state.revision });
      if (reload) setState(await api('workspace'));
      return result;
    } catch (e) {
      if (e.status === 409) await refresh();
      setError(e.message);
      return null;
    } finally {
      active.current = false;
      setBusy(false);
    }
  }

  return (
    <AppContext.Provider value={{ state, busy, submit, refresh, setError }}>
      {state ? (
        children
      ) : (
        <div className="card">
          {error || tr("Loading workspace…")} {error && <button onClick={refresh}>{tr("Retry")}</button>}
        </div>
      )}
      {state && error && (
        <div role="alert" className="toast error">
          {error}{' '}
          <button className="btn btn-ghost" onClick={() => setError('')}> {tr("Dismiss")} </button>
        </div>
      )}
    </AppContext.Provider>
  );
}
export const useApp = () => useContext(AppContext);
