import React, { useState } from 'react';
import { usePreferences } from '../context/Preferences';
import { cents, scenarioGroup, stressForecast } from '../lib/cashMetrics';
import BalanceChart from './BalanceChart';

export default function OperatingScenario({ analysis }) {
  const { t, money } = usePreferences();
  const [changes, setChanges] = useState({});
  const forecast = analysis.forecast;
  const options = [...new Set(analysis.plan.map(scenarioGroup))].sort();
  function label(key) {
    const [category, direction] = JSON.parse(key);
    return t(category) + ' · ' + t(direction === 'in' ? 'Cash receipts' : 'Expenses');
  }
  function update(key, field, value) {
    setChanges(previous => ({...previous, [key]: {...previous[key], [field]: value}}));
  }
  const valid = Object.values(changes).every(({percent, delay}) =>
    percent !== '' && Number.isFinite(+percent) && +percent >= -100 && +percent <= 1000 &&
    delay !== '' && Number.isInteger(+delay) && +delay >= 0 && +delay <= 365);
  const result = valid ? stressForecast(analysis, changes) : [];
  function metrics(points) {
    const lowest = Math.min(cents(forecast.opening_balance), ...points.map(p => cents(p.balance)));
    return [money(points.at(-1).balance), money(lowest / 100),
      money(Math.max(0, cents(forecast.reserve) - lowest) / 100),
      (Number(forecast.opening_balance) < Number(forecast.reserve) ? forecast.as_of :
        points.find(p => cents(p.balance) < cents(forecast.reserve))?.day) || t('None in horizon')];
  }
  const labels = ['Closing balance', 'Lowest balance', 'Funding needed', 'First reserve shortfall'];
  const base = metrics(forecast.daily_balances);
  const scenario = valid ? metrics(result) : [];
  return <section className="card mb-4 operating-scenario">
    <h3>{t('Operating cash scenario', 'Scenariusz przepływów operacyjnych')}</h3>
    <p className="card-sub">{t('Choose forecast categories to change their amounts or delay their payments. Compare the result with the original forecast.')}</p>
    <div className="data-tools"><label>{t('Add category')}
      <select value="" onChange={e => setChanges({...changes, [e.target.value]: {percent:'0', delay:'0'}})}>
        <option value="" disabled>{t('Select a category')}</option>
        {options.filter(key => !changes[key]).map(key => <option key={key} value={key}>{label(key)}</option>)}
      </select>
    </label></div>
    {Object.entries(changes).map(([key, rule]) => <fieldset className="data-tools scenario-rule" key={key}>
      <legend>{label(key)}</legend>
      <label>{t('Amount change (%)')}<input type="number" min="-100" max="1000" step="any"
        value={rule.percent} onChange={e=>update(key,'percent',e.target.value)}/></label>
      <label>{t('Delay (days)')}<input type="number" min="0" max="365" step="1"
        value={rule.delay} onChange={e=>update(key,'delay',e.target.value)}/></label>
      <button className="btn btn-ghost" onClick={() => setChanges(previous => {
        const next = {...previous}; delete next[key]; return next;
      })}>{t('Remove')}</button>
    </fieldset>)}
    {valid ? <>
      <table className="table section"><thead><tr><th>{t('Metric')}</th><th>{t('Baseline')}</th><th>{t('Scenario')}</th></tr></thead>
        <tbody>{labels.map((name,i) => <tr key={name}><th scope="row">{t(name)}</th><td>{base[i]}</td><td>{scenario[i]}</td></tr>)}</tbody>
      </table>
      <BalanceChart centered forecast neutral points={forecast.daily_balances} action={result}
        actionLabel={t('Scenario balance','Saldo scenariusza')} reserve={forecast.reserve}/>
    </> : <p role="status">{t('Enter a change from −100% to 1000% and a whole delay from 0 to 365 days.')}</p>}
  </section>;
}
