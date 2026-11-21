import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { usePreferences } from '../context/Preferences';
import BalanceChart from './BalanceChart';

export default function CreditOptions({ proposal, forecast }) {
  const { submit, busy } = useApp(),
    { t, money } = usePreferences();
  const [product, setProduct] = useState('overdraft'),
    [rate, setRate] = useState('9'),
    [result, setResult] = useState(null);
  return (
    <section className="section">
      <h4>{t('Credit options', 'Opcje kredytowe')}</h4>
      <p>
        {t(
          'Illustrative annual rates. Both products use the proposed limit and repay from cash above the reserve. Interest accrues daily; fees are excluded.',
          'Przykładowe stopy roczne. Oba produkty korzystają z proponowanego limitu i spłacają zadłużenie z nadwyżki ponad rezerwę. Odsetki naliczane są dziennie, bez prowizji.',
        )}
      </p>
      <form
        className="data-tools"
        onSubmit={async (e) => {
          e.preventDefault();
          setResult(
            await submit(
              'agents/liquidity/credit-scenario',
              { product, annual_rate: rate },
              false,
            ),
          );
        }}
      >
        <label>
          {t('Credit product', 'Produkt kredytowy')}
          <select
            disabled={busy}
            value={product}
            onChange={(e) => {
              setProduct(e.target.value);
              setRate(e.target.value === 'overdraft' ? '9' : '7');
              setResult(null);
            }}
          >
            <option value="overdraft">
              {t('Overdraft · draw as needed', 'Debet · według potrzeb')}
            </option>
            <option value="credit_line">
              {t(
                'Short-term credit line · draw limit upfront',
                'Krótkoterminowa linia kredytowa · pełna wypłata',
              )}
            </option>
          </select>
        </label>
        <label>
          {t(
            'Assumed annual interest (%)',
            'Zakładane oprocentowanie roczne (%)',
          )}
          <input
            disabled={busy}
            value={rate}
            type="number"
            required
            min="0"
            max="100"
            step=".01"
            onChange={(e) => {
              setRate(e.target.value);
              setResult(null);
            }}
          />
        </label>
        <button className="btn btn-primary" disabled={busy}>
          {t('Simulate credit', 'Symuluj kredyt')}
        </button>
      </form>
      {result && (
        <>
          <dl className="data-strip">
            {[
              [t('Credit limit', 'Limit kredytowy'), money(proposal.amount)],
              [
                t('Peak borrowing', 'Maksymalne zadłużenie'),
                money(result.peak),
              ],
              [t('Interest cost', 'Koszt odsetek'), money(result.interest)],
              [
                t('Remaining debt', 'Pozostałe zadłużenie'),
                money(result.outstanding),
              ],
              [
                t('Projected payoff', 'Prognozowana spłata'),
                result.payoff
                  ? result.payoff +
                    ' · ' +
                    result.days_to_close +
                    ' ' +
                    t('days', 'dni')
                  : Number(result.peak)
                    ? t('Beyond forecast horizon', 'Poza horyzontem prognozy')
                    : t('No draw needed', 'Nie wykorzystano limitu'),
              ],
            ].map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
          <BalanceChart
            forecast
            neutral
            points={forecast.daily_balances}
            action={result.points}
            reserve={forecast.reserve}
          />
        </>
      )}
    </section>
  );
}
