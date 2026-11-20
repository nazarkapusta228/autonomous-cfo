import React, { useState } from 'react';
import { usePreferences } from '../context/Preferences';

export default function Settings() {
  const { prefs, update, t } = usePreferences();
  const [currency, setCurrency] = useState(prefs.currency);
  const [rate, setRate] = useState(prefs.rate);
  return <div className="settings-grid">
    <section className="card"><h3>{t('Appearance', 'Wygląd')}</h3>
      {[
        ['theme', t('Theme', 'Motyw'), [['light', t('Light', 'Jasny')], ['dark', t('Dark', 'Ciemny')]]],
        ['size', t('Font size', 'Rozmiar tekstu'), [['small', t('Small', 'Mały')], ['medium', t('Medium', 'Średni')], ['large', t('Large', 'Duży')]]],
      ].map(([key, label, options]) => <label className="setting-row" key={key}>{label}
        <select value={prefs[key]} onChange={e => update({ [key]: e.target.value })}>
          {options.map(([value, name]) => <option key={value} value={value}>{name}</option>)}
        </select></label>)}
    </section>
    <section className="card"><h3>{t('Reporting currency', 'Waluta raportowa')}</h3>
      <form onSubmit={e => { e.preventDefault(); update({currency, rate: currency === 'EUR' ? '' : rate}); }}>
        <label className="setting-row">{t('Currency', 'Waluta')}<select value={currency} onChange={e => { setCurrency(e.target.value); setRate(''); }}>
          {['EUR','PLN','USD','CHF'].map(code => <option key={code}>{code}</option>)}</select></label>
        {currency !== 'EUR' && <label className="setting-row">{currency} / 1 EUR
          <input type="number" required min="0.000001" step="any" value={rate} onChange={e => setRate(e.target.value)} /></label>}
        <p className="card-sub">{t('Reports use your exchange rate. Payments retain their original currencies.', 'Raporty korzystają z podanego kursu. Płatności zachowują waluty źródłowe.')}</p>
        <button className="btn btn-primary" disabled={currency === prefs.currency && (currency === 'EUR' || rate === prefs.rate)}>{t('Apply currency','Zastosuj walutę')}</button>
      </form>
    </section>
    <section className="card wide"><h3>{t('Dashboard notifications', 'Powiadomienia na pulpicie')}</h3>
      {[
        ['change', t('Daily balance changes by 20% or more', 'Dzienna zmiana salda o co najmniej 20%')],
        ['low', t('Forecast balance reaches the reserve or falls below zero', 'Prognozowane saldo osiąga poziom rezerwy lub spada poniżej zera')],
        ['approval', t('An agent decision needs approval', 'Decyzja agenta wymaga zatwierdzenia')],
      ].map(([key,label]) => <label className="setting-row" key={key}>{label}<input type="checkbox" role="switch" checked={prefs[key]} onChange={e => update({[key]: e.target.checked})}/></label>)}
    </section>
  </div>;
}

export function Profile() {
  const { t } = usePreferences();
  return <div className="settings-grid"><section className="card"><h3>{t('Personal information','Dane osobowe')}</h3>
    {[[t('First name','Imię'), 'Alex'],[t('Last name','Nazwisko'), 'Morgan'],[t('Email','Adres e-mail'),'alex.morgan@example.com']].map(([name,value]) => <label key={value} className="setting-row">{name}<input disabled value={value}/></label>)}
    </section><section className="card"><h3>{t('Account security','Bezpieczeństwo konta')}</h3>
    <p className="card-sub">{t('Account changes will be available after sign-in is enabled.', 'Zmiany danych będą dostępne po uruchomieniu logowania.')}</p>
    <div className="controls"><button className="btn btn-ghost" disabled>{t('Verify email','Potwierdź adres e-mail')}</button><button className="btn btn-ghost" disabled>{t('Reset password','Zresetuj hasło')}</button></div></section></div>;
}
