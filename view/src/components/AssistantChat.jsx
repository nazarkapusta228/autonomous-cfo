import React, { useEffect, useRef, useState } from 'react';
import { Send } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { usePreferences } from '../context/Preferences';
import { api } from '../lib/api';
import Snail from './Snail';
import { monthEnd } from './CashOverview';

const words = {
  en: [
    'Finance assistant',
    'Hi! Happy to help.',
    'Ask about your finances…',
    'Send',
    'Thinking…',
    'Could not get an answer. Please try again.',
    'Forecast date',
    'Payment due',
    'Estimated payment',
    'Balance change',
    'Payment change',
    'Projected balance',
    'Reserve warning',
    'Available cash for purchase',
    'Credit needed',
    'days',
  ],
  pl: [
    'Asystent finansowy',
    'Cześć! Chętnie pomogę.',
    'Zapytaj o swoje finanse…',
    'Wyślij',
    'Myślę…',
    'Nie udało się uzyskać odpowiedzi. Spróbuj ponownie.',
    'Data prognozy',
    'Płatność do wykonania',
    'Przewidywana płatność',
    'Zmiana salda',
    'Zmiana płatności',
    'Prognozowane saldo',
    'Ostrzeżenie o rezerwie',
    'Środki własne na zakup',
    'Potrzebny kredyt',
    'dni',
  ],
  de: [
    'Finanzassistent',
    'Hallo! Ich helfe Ihnen gern.',
    'Frage zu Ihren Finanzen…',
    'Senden',
    'Ich denke nach…',
    'Keine Antwort erhalten. Bitte erneut versuchen.',
    'Prognosestichtag',
    'Fällige Zahlung',
    'Geschätzte Zahlung',
    'Saldoänderung',
    'Zahlungsänderung',
    'Prognostizierter Kontostand',
    'Reservewarnung',
    'Eigenmittel für den Kauf',
    'Kreditbedarf',
    'Tage',
  ],
};

function notices(state, prefs, w, money, today, priorPlan) {
  const { forecast: f, plan } = state.analysis;
  const last = f.daily_balances.at(-1);
  const anchor = today >= f.as_of && today <= last?.day ? today : f.as_of;
  const projected = new Set(state.analysis.projection_keys);
  const parties = new Map(
    state.analysis.reconciliation.outstanding.map((i) => [
      i.invoice_id,
      i.counterparty,
    ]),
  );
  const lines = [];
  plan.forEach((p, i) => {
    const days = Math.round(
      (Date.parse(p.date) - Date.parse(anchor)) / 86400000,
    );
    if (Number(p.amount_eur) >= 0 || days < 0 || days > 3) return;
    lines.push(
      w[projected.has(state.plan_keys[i]) ? 8 : 7] +
        ' · ' +
        p.date +
        ' (' +
        days +
        ' ' +
        w[15] +
        ') · ' +
        money(-Number(p.amount_eur)) +
        ' · ' +
        (parties.get(p.invoice_id) || p.description || p.category),
    );
  });
  const points = [
    { day: f.as_of, balance: f.opening_balance },
    ...f.daily_balances,
  ];
  const low = points.find((p) => Number(p.balance) <= Number(f.reserve));
  if (prefs.low && low)
    lines.push(w[12] + ' · ' + low.day + ' · ' + money(low.balance));
  if (prefs.change) {
    const cutoff = f.as_of;
    const rows = state.transactions;
    const movement = rows
      .filter((r) => r.value_on === cutoff || r.booked_on === cutoff)
      .reduce((sum, r) => sum + Number(r.amount_eur), 0);
    const prior = Number(f.opening_balance) - movement;
    const outlook =
      f.daily_balances.find((p) => p.day === monthEnd(f.as_of, 1)) || last;
    const change = (label, date, before, after, direction = 1) => {
      const pct = before ? (100 * (after - before)) / Math.abs(before) : 0;
      if (Math.abs(pct) < prefs.changeThreshold) return;
      lines.push(
        label +
          ' · ' +
          date +
          ' · ' +
          money(before) +
          ' → ' +
          money(after) +
          ' (' +
          Math.round(pct) +
          '%)' +
          (outlook
            ? ' · ' +
              w[11] +
              ' ' +
              outlook.day +
              ' · ' +
              money(outlook.balance) +
              ' · ' +
              {
                en: 'Without this change',
                pl: 'Bez tej zmiany',
                de: 'Ohne diese Änderung',
              }[prefs.language] +
              ' ' +
              money(Number(outlook.balance) - direction * (after - before))
            : ''),
      );
    };
    change(w[9], cutoff, prior, Number(f.opening_balance));
    plan.forEach((p, i) => {
      const old = priorPlan.get(state.plan_keys[i]);
      if (
        !old ||
        old.date !== p.date ||
        Number(old.amount_eur) >= 0 ||
        Number(p.amount_eur) >= 0
      )
        return;
      change(
        w[10] +
          ' · ' +
          (parties.get(p.invoice_id) || p.description || p.category),
        p.date,
        -Number(old.amount_eur),
        -Number(p.amount_eur),
        p.date <= outlook?.day ? -1 : 0,
      );
    });
    const previous = new Map();
    for (const r of [...rows].sort((a, b) =>
      a.value_on.localeCompare(b.value_on),
    )) {
      if (!r.counterparty || Number(r.amount_eur) >= 0) continue;
      const key = JSON.stringify([r.counterparty, r.category]);
      const old = previous.get(key);
      if (r.value_on === cutoff && old && old.value_on !== cutoff)
        change(
          w[10] + ' · ' + r.counterparty,
          cutoff,
          -Number(old.amount_eur),
          -Number(r.amount_eur),
          -1,
        );
      previous.set(key, r);
    }
  }
  return [...new Set(lines)];
}

export default function AssistantChat({ expand }) {
  const { state } = useApp(),
    { prefs, money } = usePreferences();
  const w = words[prefs.language] || words.en;
  const [draft, setDraft] = useState(''),
    [thread, setThread] = useState([]),
    [busy, setBusy] = useState(false);
  const [typing, setTyping] = useState(false),
    [idle, setIdle] = useState(false),
    [today, setToday] = useState(new Date().toLocaleDateString('sv-SE'));
  const language = useRef(prefs.language),
    log = useRef(null),
    pending = useRef(false),
    mounted = useRef(true);
  language.current = prefs.language;
  useEffect(() => {
    mounted.current = true;
    let timer, stop;
    const reset = () => {
      clearTimeout(timer);
      clearTimeout(stop);
      setIdle(false);
      timer = setTimeout(() => {
        setIdle(true);
        stop = setTimeout(reset, 2000);
      }, 30000);
    };
    const events = ['pointermove', 'pointerdown', 'keydown', 'scroll'];
    events.forEach((e) =>
      window.addEventListener(e, reset, { passive: true, capture: true }),
    );
    const clock = setInterval(
      () => setToday(new Date().toLocaleDateString('sv-SE')),
      60000,
    );
    reset();
    return () => {
      mounted.current = false;
      clearInterval(clock);
      clearTimeout(timer);
      clearTimeout(stop);
      events.forEach((e) => window.removeEventListener(e, reset, true));
    };
  }, []);
  useEffect(() => {
    if (thread.length && log.current)
      log.current.scrollTop = log.current.scrollHeight;
  }, [thread, busy]);
  async function send(e) {
    e.preventDefault();
    const question = draft.trim();
    if (!question || pending.current) return;
    pending.current = true;
    setBusy(true);
    setTyping(false);
    setDraft('');
    const initial = language.current;
    const body = {
      revision: state.revision,
      question,
      language: initial,
      history: thread
        .filter((m) => !m.error)
        .slice(-4)
        .map(
          (m) => (m.user ? 'User: ' : 'Assistant: ') + m.text.slice(0, 1480),
        ),
    };
    setThread((prev) => [...prev, { user: true, text: question }]);
    try {
      let result = await api('assistant', body);
      let used = initial;
      while (mounted.current && language.current !== used) {
        used = language.current;
        result = await api('assistant', {
          ...body,
          language: used,
          language_changed: true,
        });
      }
      if (mounted.current)
        setThread((prev) => [
          ...prev,
          {
            text: result.answer,
            cash: result.cash,
            credit: result.credit,
            months: result.months,
            covered: result.covered,
          },
        ]);
    } catch {
      if (mounted.current) {
        setThread((prev) => [...prev, { error: true }]);
        setDraft(question);
      }
    } finally {
      pending.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  const lastPlan = useRef(null);
  const [priorPlan, setPriorPlan] = useState(() => new Map());
  useEffect(() => {
    if (lastPlan.current?.revision === state.revision) return;
    setPriorPlan(lastPlan.current?.entries ?? new Map());
    lastPlan.current = {
      revision: state.revision,
      entries: new Map(
        state.analysis.plan.map((p, i) => [state.plan_keys[i], p]),
      ),
    };
  }, [state.revision, state.analysis.plan, state.plan_keys]);
  const alerts = React.useMemo(
    () => notices(state, prefs, w, money, today, priorPlan),
    [state, prefs, w, money, today, priorPlan],
  );
  return (
    <section
      className={'snail-chat' + (thread.length || typing ? ' tall' : '')}
      aria-label={w[0]}
    >
      <header>
        <Snail
          pose={
            busy ? 'thinking' : idle ? 'looking' : typing ? 'writing' : 'rest'
          }
        />
        <strong>{w[0]}</strong>
      </header>
      <div className="snail-log" ref={log} role="log" aria-live="polite">
        <p>{w[1]}</p>
        {alerts.length > 0 && (
          <div className="snail-alerts">
            <small>
              {w[6]} · {state.settings.as_of}
            </small>
            {alerts.map((a) => (
              <p key={a}>{a}</p>
            ))}
          </div>
        )}
        {thread.map((m, i) => (
          <p key={i} className={m.user ? 'snail-question' : ''}>
            {m.error ? w[5] : m.text}
            {m.cash != null && (
              <>
                <br />
                {w[13]} · {money(m.cash)}
                <br />
                {w[14]} · {money(m.credit)}
                {m.months > 0 && (
                  <>
                    <br />
                    {
                      {
                        en: 'Past months whose net cash flow covered this price',
                        pl: 'Miesiące z przepływem netto pokrywającym cenę',
                        de: 'Monate mit ausreichendem Nettozufluss',
                      }[prefs.language]
                    }{' '}
                    · {m.covered}/{m.months} (
                    {Math.round((100 * m.covered) / m.months)}%)
                  </>
                )}
              </>
            )}
          </p>
        ))}
        {busy && <p role="status">{w[4]}</p>}
      </div>
      <form onSubmit={send}>
        <input
          value={draft}
          maxLength={1200}
          placeholder={w[2]}
          aria-label={w[2]}
          onBlur={() => setTyping(false)}
          onFocus={() => {
            if (draft) {
              expand();
              setTyping(true);
            }
          }}
          onChange={(e) => {
            setDraft(e.target.value);
            setTyping(Boolean(e.target.value));
            expand();
          }}
        />
        <button
          type="submit"
          disabled={busy || !draft.trim()}
          aria-label={w[3]}
        >
          <Send size={17} />
        </button>
      </form>
    </section>
  );
}
