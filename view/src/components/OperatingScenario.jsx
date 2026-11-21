import React, { useState } from 'react';
import { usePreferences } from '../context/Preferences';
import { stressForecast, operatingCost } from '../lib/cashMetrics';
import BalanceChart from './BalanceChart';

export default function OperatingScenario({ analysis }) {
  const { t, money } = usePreferences();
  const [rent, setRent] = useState('0'),
    [salary, setSalary] = useState('0'),
    [delay, setDelay] = useState('0');
  const receipts = [
    ...new Set(
      analysis.plan
        .filter((p) => Number(p.amount_eur) > 0)
        .map((p) => p.category),
    ),
  ];
  const [category, setCategory] = useState(
    receipts.find((c) => /receivabl|revenue|sales/i.test(c)) ||
      receipts[0] ||
      '',
  );
  const inputs = [
    [t('Rent increase (%)', 'Podwyżka czynszu (%)'), rent, setRent, 1000],
    [t('Payroll increase (%)', 'Podwyżka płac (%)'), salary, setSalary, 1000],
    [
      t('Receipt delay (days)', 'Opóźnienie wpływu (dni)'),
      delay,
      setDelay,
      365,
    ],
  ];
  const valid =
    inputs.every(
      ([, v, , max]) => v !== '' && Number.isFinite(+v) && +v >= 0 && +v <= max,
    ) && Number.isInteger(+delay);
  const forecast = analysis.forecast,
    result = valid
      ? stressForecast(analysis, +rent, +salary, +delay, category)
      : [];
  const costCount = (kind) =>
    analysis.plan.filter(
      (p) =>
        Number(p.amount_eur) < 0 &&
        (operatingCost(p.category) || operatingCost(p.description)) === kind,
    ).length;
  return (
    <section className="card mb-4">
      <h3>
        {t('Operating cash scenario', 'Scenariusz przepływów operacyjnych')}
      </h3>
      <p className="card-sub">
        {t(
          'Adjust the current forecast. Delayed receipts appear on the new date and may move beyond the chart.',
          'Zmień założenia prognozy. Opóźnione wpływy pojawią się w nowym terminie, także poza zakresem wykresu.',
        )}
      </p>
      <div className="data-tools">
        {inputs.map(([label, v, set, max]) => (
          <label key={label}>
            {label}
            <input
              type="number"
              min="0"
              max={max}
              step={set === setDelay ? '1' : 'any'}
              value={v}
              onChange={(e) => set(e.target.value)}
            />
          </label>
        ))}
        <label>
          {t('Receipts to delay', 'Opóźniane wpływy')}
          <select
            value={category}
            disabled={!receipts.length}
            onChange={(e) => setCategory(e.target.value)}
          >
            {!receipts.length && <option value="">—</option>}
            {receipts.map((c) => (
              <option key={c} value={c}>
                {t(c)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="projection-result">
        {t('Matching forecast entries', 'Dopasowane pozycje prognozy')} ·{' '}
        {t('Rent', 'Czynsz')} {costCount('rent')} · {t('Payroll', 'Płace')}{' '}
        {costCount('payroll')} · {t('Receipts', 'Wpływy')}{' '}
        {
          analysis.plan.filter(
            (p) => p.category === category && Number(p.amount_eur) > 0,
          ).length
        }
      </p>
      {valid ? (
        <>
          <dl className="data-strip">
            <div>
              <dt>
                {t('Lowest scenario balance', 'Najniższe saldo scenariusza')}
              </dt>
              <dd>{money(Math.min(...result.map((p) => p.balance)))}</dd>
            </div>
            <div>
              <dt>{t('Change at forecast end', 'Zmiana na końcu prognozy')}</dt>
              <dd>
                {money(
                  result.at(-1).balance -
                    Number(forecast.daily_balances.at(-1).balance),
                )}
              </dd>
            </div>
          </dl>
          <BalanceChart forecast
            points={forecast.daily_balances}
            actionLabel={t('Scenario balance','Saldo scenariusza')}
            action={result}
            reserve={forecast.reserve}
            neutral
          />
        </>
      ) : (
        <p role="status">
          {t(
            'Enter increases from 0 to 1000% and a whole delay from 0 to 365 days.',
            'Podaj podwyżki od 0 do 1000% i opóźnienie od 0 do 365 pełnych dni.',
          )}
        </p>
      )}
    </section>
  );
}
