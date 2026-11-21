import React from 'react';
import { RotateCw } from 'lucide-react';
import { usePreferences } from '../context/Preferences';

export default function Settings() {
  const { prefs, update, t, exchange, locale } = usePreferences();
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
      <label className="setting-row">{t('Currency', 'Waluta')}
        <select value={prefs.currency} onChange={e => update({ currency: e.target.value })}>
          {['EUR','PLN','USD','CHF'].map(code => <option key={code}>{code}</option>)}
        </select>
      </label>
      {prefs.currency !== 'EUR' && <div aria-live="polite" className="rate-status">
        {exchange.table && <p>1 EUR = {exchange.table.rates[prefs.currency].toLocaleString(locale, {maximumFractionDigits: 4})} {prefs.currency}
          {' · NBP · '}{exchange.table.date}</p>}
        {!exchange.table && !exchange.failed && <p>{t('Fetching the latest rate. Showing EUR.', 'Pobieranie kursu. Kwoty w EUR.')}</p>}
        {exchange.failed && <><p>{exchange.table
          ? t('Update unavailable. Using the rate above.', 'Aktualizacja niedostępna. Obowiązuje powyższy kurs.')
          : t('Rate unavailable. Showing EUR.', 'Kurs niedostępny. Kwoty w EUR.')}</p>
          <button type="button" className="btn btn-ghost rate-retry" disabled={exchange.loading} onClick={exchange.retry}>
            <RotateCw size={15} aria-hidden="true" />
            {exchange.loading ? t('Retrying…', 'Ponawianie…') : t('Retry')}
          </button></>}
      </div>}
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
