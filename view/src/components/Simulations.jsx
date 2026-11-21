import React, { useState } from 'react';
import { usePreferences } from '../context/Preferences';
import { useApp } from '../context/AppContext';
import { stressForecast, operatingCost } from '../lib/cashMetrics';
import BalanceChart from './BalanceChart';
import SimulationForm from './SimulationForm';

function OperatingScenario({ analysis }) {
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
          <BalanceChart
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

export default function Simulations() {
  const { state } = useApp(),
    { t } = usePreferences();
  const currencies = [
    ...new Set(
      state.statement_rows.map((r) => r.currency).filter((c) => c !== 'EUR'),
    ),
  ].sort();
  const [choice, setChoice] = useState('');
  const currency = currencies.includes(choice) ? choice : currencies[0];
  const last = state.transactions.find(
    (r) => r.currency === currency && r.booked_rate,
  );
  const tax = state.analysis.plan.find(
    (p) =>
      Number(p.amount_eur) < 0 &&
      /tax|steuer/i.test(p.category + ' ' + p.description),
  );
  return (
    <>
      <OperatingScenario key={state.revision} analysis={state.analysis} />
      {currency && (
        <>
          <label className="booking-month">
            {t('Statement currency', 'Waluta wyciągu')}
            <select
              value={currency}
              onChange={(e) => setChoice(e.target.value)}
            >
              {currencies.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          <SimulationForm
            key={currency + state.revision}
            kind="fx_forward"
            currency={currency}
            lastRate={last && { day: last.value_on, rate: last.booked_rate }}
            title={t('CHF forward simulation').replace('CHF', currency)}
            description={t(
              'Enter a future obligation and an assumed exchange rate.',
              'Podaj kwotę zobowiązania i zakładany kurs.',
            )}
          />
        </>
      )}
      <SimulationForm
        key={'tax' + state.revision}
        kind="tax_prepayment"
        suggested={tax ? String(-Number(tax.amount_eur)) : ''}
        suggestedDate={tax?.date}
        title={t('Adjusted tax prepayment')}
        description={t(
          'Use an amount from a tax notice or your accountant. Approving records a simulated filing in this workspace.',
        )}
      />
      <div className="grid-even enquiry-pair" key={state.revision}>
        <SimulationForm
          kind="money_market"
          title={t('Money market enquiry')}
          suggested={
            state.assessments.investment?.recommendation.free_cash || ''
          }
          description={t(
            'Simulate a request for a fund quote within the investment agent’s free-cash limit. Run the assessment first.',
          )}
        />
        <SimulationForm
          kind="capex"
          title={t('Equipment finance enquiry')}
          description={t(
            'Enter the equipment budget and financing date for a simulated credit enquiry. Terms require a lender quote.',
          )}
        />
      </div>
    </>
  );
}
