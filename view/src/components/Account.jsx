import React, { createContext, useContext, useEffect, useState } from 'react';
import { api } from '../lib/api';
import { usePreferences } from '../context/Preferences';

const Account = createContext(null);
export const useAccount = () => useContext(Account);

function Field({
  name,
  label,
  type = 'text',
  autoComplete,
  value,
  onChange,
  minLength,
  maxLength,
}) {
  return (
    <label>
      {label}
      <input
        required
        name={name}
        type={type}
        autoComplete={autoComplete}
        minLength={minLength}
        maxLength={maxLength}
        value={value}
        onChange={onChange}
      />
    </label>
  );
}

export function AccountGate({ children }) {
  const [user, setUser] = useState(undefined);
  const [error, setError] = useState('');
  const { t } = usePreferences();
  async function load() {
    setError('');
    try {
      setUser(await api('account/me'));
    } catch (e) {
      if (e.status === 401) setUser(null);
      else setError(e.message);
    }
  }
  useEffect(() => {
    load();
    const expired = () => setUser(null);
    window.addEventListener('cfo-session-expired', expired);
    return () => window.removeEventListener('cfo-session-expired', expired);
  }, []);
  if (user === undefined)
    return (
      <main className="auth-layout">
        <div className="card">
          {error || t('Loading…', 'Wczytywanie…')}
          {error && (
            <button className="btn btn-primary" onClick={load}>
              {t('Retry', 'Ponów')}
            </button>
          )}
        </div>
      </main>
    );
  return (
    <Account.Provider value={{ user, setUser }}>{user ? children : <Login />}</Account.Provider>
  );
}

function Login() {
  const { setUser } = useAccount();
  const { t, prefs, update } = usePreferences();
  const [mode, setMode] = useState('login'),
    [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(''),
    [error, setError] = useState('');
  const labels = {
    login: t('Sign in', 'Zaloguj się'),
    signup: t('Create account', 'Utwórz konto'),
    forgot: t('Send reset code', 'Wyślij kod resetowania'),
    reset: t('Set new password', 'Ustaw nowe hasło'),
    activate: t('Verify email', 'Potwierdź adres e-mail'),
  };
  function change(next) {
    setMode(next);
    setError('');
    setNotice('');
  }
  async function submit(e) {
    e.preventDefault();
    if (busy) return;
    const values = Object.fromEntries(new FormData(e.currentTarget));
    setBusy(true);
    setError('');
    setNotice('');
    try {
      if (mode === 'login') setUser(await api('account/login', values));
      else if (mode === 'signup' || mode === 'forgot') {
        await api('account/' + mode, values);
        change(mode === 'signup' ? 'activate' : 'reset');
        setNotice(
          t(
            'Check your inbox for a code. It expires in 20 minutes.',
            'Sprawdź skrzynkę e-mail. Kod jest ważny przez 20 minut.',
          ),
        );
      } else {
        await api('account/confirm', { ...values, purpose: mode });
        change('login');
        setNotice(t('Done. Sign in to continue.', 'Gotowe. Zaloguj się, aby kontynuować.'));
      }
    } catch (err) {
      setError(t(err.message));
    } finally {
      setBusy(false);
    }
  }
  const confirmation = mode === 'activate' || mode === 'reset';
  return (
    <main className="auth-layout">
      <section className="card auth-card">
        <header>
          <strong>Autonomous CFO</strong>
          <select
            aria-label={t('Language', 'Język')}
            value={prefs.language}
            onChange={(e) => update({ language: e.target.value })}
          >
            <option value="en">English</option>
            <option value="pl">Polski</option>
          </select>
        </header>
        <h1>{labels[mode]}</h1>
        <form key={mode} className="account-form" onSubmit={submit}>
          {mode === 'signup' && (
            <div className="name-fields">
              <Field
                name="first_name"
                label={t('First name', 'Imię')}
                autoComplete="given-name"
                maxLength={100}
              />
              <Field
                name="last_name"
                label={t('Last name', 'Nazwisko')}
                autoComplete="family-name"
                maxLength={100}
              />
            </div>
          )}
          {!confirmation && (
            <Field
              name="email"
              label={t('Email', 'Adres e-mail')}
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          )}
          {confirmation && (
            <Field
              name="code"
              label={t('Email code', 'Kod z wiadomości')}
              autoComplete="one-time-code"
            />
          )}
          {mode !== 'forgot' && (
            <Field
              name="password"
              label={mode === 'reset' ? t('New password', 'Nowe hasło') : t('Password', 'Hasło')}
              type="password"
              minLength={10}
              maxLength={256}
              autoComplete={
                ['signup', 'reset'].includes(mode) ? 'new-password' : 'current-password'
              }
            />
          )}
          {mode === 'signup' && (
            <small>{t('Use at least 10 characters.', 'Użyj co najmniej 10 znaków.')}</small>
          )}
          <button disabled={busy} className="btn btn-primary">
            {labels[mode]}
          </button>
        </form>
        <p role="status">{notice}</p>
        {error && <p role="alert">{error}</p>}
        <nav>
          {mode === 'login' ? (
            <>
              <button className="btn btn-ghost" onClick={() => change('signup')}>
                {labels.signup}
              </button>
              <button className="btn btn-ghost" onClick={() => change('forgot')}>
                {t('Forgot password?', 'Nie pamiętasz hasła?')}
              </button>
            </>
          ) : (
            <button className="btn btn-ghost" onClick={() => change('login')}>
              {t('Back to sign in', 'Powrót do logowania')}
            </button>
          )}
          {['signup', 'forgot'].includes(mode) && (
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => change(mode === 'signup' ? 'activate' : 'reset')}
            >
              {t('I have a code', 'Mam kod')}
            </button>
          )}
        </nav>
      </section>
    </main>
  );
}

export function Profile() {
  const { user, setUser } = useAccount(),
    { t } = usePreferences();
  const [mode, setMode] = useState(''),
    [busy, setBusy] = useState(false),
    [msg, setMsg] = useState(''),
    [error, setError] = useState('');
  const labels = {
    names: t('Edit name', 'Zmień dane'),
    email: t('Change email', 'Zmień e-mail'),
    confirm: t('Confirm new email', 'Potwierdź nowy adres'),
    password: t('Change password', 'Zmień hasło'),
    forgot: t('Reset password', 'Zresetuj hasło'),
    logout: t('Log out', 'Wyloguj się'),
    delete: t('Delete my account', 'Usuń moje konto'),
  };
  async function run(action, fields = {}) {
    if (busy) return;
    setBusy(true);
    setError('');
    setMsg('');
    try {
      if (action === 'names') setUser(await api('account/names', fields));
      if (action === 'email') {
        await api('account/change-email', fields);
        setMode('confirm');
        setMsg(t('Check your new email for the code.', 'Sprawdź kod na nowym adresie e-mail.'));
        return;
      }
      if (action === 'confirm') {
        await api('account/confirm', { ...fields, purpose: 'email' });
        setUser(await api('account/me'));
      }
      if (action === 'forgot') {
        await api('account/forgot', { email: user.email });
        setMode('reset');
        setMsg(
          t('Check your inbox for the reset code.', 'Sprawdź kod resetowania w skrzynce e-mail.'),
        );
        return;
      }
      if (action === 'reset') {
        await api('account/confirm', { ...fields, purpose: 'reset' });
        setUser(null);
        return;
      }
      if (['logout', 'delete', 'password'].includes(action)) {
        await api('account/' + action, fields);
        setUser(null);
        return;
      }
      setMode('');
      setMsg(t('Changes saved.', 'Zapisano zmiany.'));
    } catch (e) {
      setError(t(e.message));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="account-form">
      <strong>
        {user.first_name} {user.last_name}
      </strong>
      <p>{user.email}</p>
      {!mode ? (
        <div className="profile-actions">
          {['names', 'email', 'password', 'forgot', 'logout', 'delete'].map((action) => (
            <button
              key={action}
              disabled={busy}
              type="button"
              className={'btn ' + (action === 'delete' ? 'btn-danger' : 'btn-ghost')}
              onClick={() => {
                setMsg('');
                setError('');
                if (['logout', 'forgot'].includes(action)) run(action);
                else setMode(action);
              }}
            >
              {labels[action]}
            </button>
          ))}
        </div>
      ) : (
        <form
          key={mode}
          className="account-form"
          onSubmit={(e) => {
            e.preventDefault();
            run(mode, Object.fromEntries(new FormData(e.currentTarget)));
          }}
        >
          {mode === 'names' &&
            [
              ['first_name', t('First name', 'Imię')],
              ['last_name', t('Last name', 'Nazwisko')],
            ].map(([key, label]) => (
              <label key={key}>
                {label}
                <input name={key} required maxLength={100} defaultValue={user[key]} />
              </label>
            ))}
          {mode === 'email' && (
            <Field name="email" label={t('New email', 'Nowy e-mail')} type="email" />
          )}
          {['confirm', 'reset'].includes(mode) && (
            <Field
              name="code"
              label={t('Email code', 'Kod z wiadomości')}
              autoComplete="one-time-code"
            />
          )}
          {mode === 'delete' && (
            <p>
              {t(
                'Permanently delete your account and all its workspace data?',
                'Trwale usunąć konto i wszystkie dane jego przestrzeni roboczej?',
              )}
            </p>
          )}
          {mode !== 'names' && (
            <Field
              name="password"
              label={
                mode === 'reset'
                  ? t('New password', 'Nowe hasło')
                  : t('Current password', 'Obecne hasło')
              }
              type="password"
              autoComplete={mode === 'reset' ? 'new-password' : 'current-password'}
              minLength={10}
              maxLength={256}
            />
          )}
          {mode === 'password' && (
            <Field
              name="new_password"
              label={t('New password', 'Nowe hasło')}
              type="password"
              autoComplete="new-password"
              minLength={10}
              maxLength={256}
            />
          )}
          {mode === 'email' && (
            <button
              className="btn btn-ghost"
              type="button"
              onClick={() => {
                setMode('confirm');
                setError('');
              }}
            >
              {t('I have a code', 'Mam kod')}
            </button>
          )}
          <button
            disabled={busy}
            className={'btn ' + (mode === 'delete' ? 'btn-danger' : 'btn-primary')}
          >
            {mode === 'delete' ? labels.delete : t('Save', 'Zapisz')}
          </button>
          <button
            disabled={busy}
            className="btn btn-ghost"
            type="button"
            onClick={() => {
              setMode('');
              setError('');
              setMsg('');
            }}
          >
            {t('Cancel', 'Anuluj')}
          </button>
        </form>
      )}
      {msg && <p role="status">{msg}</p>}
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
