import React, { createContext, useContext, useState } from 'react';
import { useApp } from './AppContext';
import { usePreferences } from './Preferences';
import DateField from '../components/DateField';

const Context = createContext(null);
export const usePeriod = () => useContext(Context);

export function StatementPeriod({ children }) {
  const { state } = useApp();
  const points = state.history;
  const first = points[0]?.day;
  const last = points.at(-1)?.day;
  const month = last && [first, last.slice(0, 7) + '-01'].sort().at(-1);
  const [custom, setCustom] = useState(null);
  const [start, end] = custom && custom[0] >= first && custom[1] <= last ? custom : [month, last];
  const includes = day => day >= start && day <= end;
  const rows = (state.statement_rows ?? state.transactions).filter(r => includes(r.value_on));
  return <Context.Provider value={{first,last,month,start,end,setCustom,rows,points:points.filter(p => includes(p.day))}}>{children}</Context.Provider>;
}

export function PeriodPicker() {
  const {t} = usePreferences();
  const {first,last,month,start,end,setCustom} = usePeriod();
  if (!first) return null;
  return <section className="card mb-4"><h3>{t('Statement period','Okres wyciągu')}</h3><div className="controls range-controls">
    <DateField label={t('Chart start date','Data początkowa')} min={first} max={end} value={start} onChange={v => v >= first && v <= end && setCustom([v,end])}/>
    <DateField label={t('Chart end date','Data końcowa')} min={start} max={last} value={end} onChange={v => v >= start && v <= last && setCustom([start,v])}/>
    <button className="btn btn-ghost" aria-pressed={start === month && end === last} onClick={() => setCustom(null)}>{t('Last month','Ostatni miesiąc')}</button>
    <button className="btn btn-ghost" aria-pressed={start === first && end === last} onClick={() => setCustom([first,last])}>{t('Full statement','Cały wyciąg')}</button>
  </div></section>;
}
