import { usePreferences } from '../context/Preferences';
import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import MessageDialog from '../components/MessageDialog';
import { api } from '../lib/api';

const AppContext = createContext();

export function AppProvider({ children }) {
  const { t: tr } = usePreferences();
  const [state, setState] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [question,setQuestion] = useState(null);
  const confirm = message => new Promise(resolve => setQuestion({message,resolve}));
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
      const result = await api(path, { revision: state.revision, ...fields });
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
    <AppContext.Provider value={{ state, busy, submit, refresh, setError, confirm }}>
      {state ? (
        children
      ) : (
        <div className="card workspace-loading" role="status">
          {error || tr("Loading workspace…")} {error && <button onClick={refresh}>{tr("Retry")}</button>}
        </div>
      )}
      {question && <MessageDialog confirmation message={question.message} close={answer=>{
        setQuestion(null); question.resolve(answer);
      }}/>}
      {state && error && <MessageDialog message={error} close={()=>setError('')}/>}
    </AppContext.Provider>
  );
}
export const useApp = () => useContext(AppContext);
