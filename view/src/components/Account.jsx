import React, { createContext, useContext, useEffect, useId, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import LanguageSwitcher from './LanguageSwitcher';
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
  const id = useId();
  const { t } = usePreferences();
  const [visible, setVisible] = useState(false);
  const isPassword = type === 'password';
  const input = (
      <input id={id}
        required
        name={name}
        type={isPassword && visible ? 'text' : type}
        autoComplete={autoComplete}
        minLength={minLength}
        maxLength={name === 'code' ? 6 : maxLength}
        pattern={name === 'code' ? '[0-9]{6}' : undefined}
        inputMode={name === 'code' ? 'numeric' : undefined}
        value={value}
        onChange={onChange}
      />
  );
  if (!isPassword) return <label>{label}{input}</label>;
  const action = visible ? t('Hide password', 'Ukryj hasło') : t('Show password', 'Pokaż hasło');
  return (
    <div className="password-field">
      <label htmlFor={id}>{label}</label>
      <div className="password-control">
        {input}
        <button type="button" aria-label={action} title={action} aria-controls={id}
          onClick={() => setVisible(!visible)}>
          {visible ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
        </button>
      </div>
    </div>
  );
}

function RepeatPassword() {
  const { t } = usePreferences();
  return <Field name="repeat" type="password" autoComplete="new-password"
    label={t('Confirm new password', 'Powtórz nowe hasło')} />;
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
    <Account.Provider value={{ user, setUser }}>
      {user ? children : <Login />}
    </Account.Provider>
  );
}

function DeliveryNotice({ receipt, email }) {
  const { t } = usePreferences();
  if (!receipt) return null;
  const preview = receipt.delivery === 'preview';
  let inbox;
  if (
    preview && receipt.preview_url &&
    ['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname)
  ) {
    try {
      const url = new URL(receipt.preview_url);
      if (
        url.protocol === 'http:' &&
        ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
      ) {
        inbox = url.href;
      }
    } catch {
      /* The private mailbox may have no local URL configured. */
    }
  }
  return (
    <div className="delivery-notice" role="status">
      {preview
        ? t(
            'Codes go to the private Mailpit inbox in this environment.',
            'W tym środowisku kody trafiają do prywatnej skrzynki Mailpit.',
          )
        : t(
            'Check your inbox and spam folder for the latest code.',
            'Sprawdź skrzynkę odbiorczą i folder spam, aby znaleźć najnowszy kod.',
          )}
      <strong>{email}</strong>
      {inbox && (
        <a href={inbox} target="_blank" rel="noreferrer">
          {t('Open local inbox', 'Otwórz lokalną skrzynkę')}
        </a>
      )}
    </div>
  );
}

function Login() {
  const { setUser } = useAccount();
  const { t } = usePreferences();
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [signupPassword, setSignupPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [receipt, setReceipt] = useState(null);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const labels = {
    resetCode: t('Verify reset code', 'Potwierdź kod resetowania'),
    login: t('Sign in', 'Zaloguj się'),
    signup: t('Create account', 'Utwórz konto'),
    forgot: t('Send reset code', 'Wyślij kod resetowania'),
    reset: t('Set new password', 'Ustaw nowe hasło'),
    activate: t('Verify email', 'Potwierdź adres e-mail'),
  };
  const guidance = {
    login: t(
      'Sign in to your finance workspace.',
      'Zaloguj się do swojej przestrzeni finansowej.',
    ),
    signup: t(
      'Use an email address you can verify.',
      'Podaj adres e-mail, do którego masz dostęp.',
    ),
    forgot: t(
      'Enter the email address you used to register.',
      'Podaj adres e-mail użyty przy rejestracji.',
    ),
    resetCode: t('Enter the six-digit code from your email.', 'Wpisz sześciocyfrowy kod z wiadomości e-mail.'),
    reset: t('Enter your new password twice.', 'Wpisz dwukrotnie nowe hasło.'),
    activate: t(
      'Enter the latest verification code. It is valid for 20 minutes.',
      'Wpisz najnowszy kod potwierdzający. Jest ważny przez 20 minut.',
    ),
  };
  function change(next) {
    setMode(next);
    setError('');
    setNotice('');
    setReceipt(null);
    setSignupPassword('');
    setResetToken('');
  }
  async function submit(e) {
    e.preventDefault();
    if (busy) return;
    const values = Object.fromEntries(new FormData(e.currentTarget));
    setBusy(true);
    setError('');
    setNotice('');
    try {
      if (e.nativeEvent.submitter?.value === 'existingCode') {
        change('resetCode');
        setEmail(values.email.trim());
      } else if (mode === 'login') setUser(await api('account/login', values));
      else if (mode === 'signup' || mode === 'forgot') {
        const delivery = await api('account/' + mode, values);
        change(mode === 'signup' ? 'activate' : 'resetCode');
        setEmail(values.email.trim());
        if (mode === 'signup') setSignupPassword(values.password);
        setReceipt(delivery);
      } else if (mode === 'resetCode') {
        const { token } = await api('account/reset-code', { email, code: values.code });
        change('reset');
        setResetToken(token);
      } else if (mode === 'reset') {
        if (values.password !== values.repeat) {
          setError(t('Passwords do not match.', 'Hasła nie są takie same.'));
          return;
        }
        await api('account/reset-password', { token: resetToken, password: values.password });
        change('login');
        setNotice('changed');
      } else {
        await api('account/confirm', {
          ...values,
          email,
          password: signupPassword,
          purpose: mode,
        });
        change('login');
        setNotice('verified');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  async function resend() {
    if (busy) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      setReceipt(
        await api(mode === 'activate' ? 'account/resend' : 'account/forgot', {
          email,
        }),
      );
      setNotice('resent');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  const confirmation = mode === 'activate' || mode === 'resetCode';
  return (
    <main className="auth-layout">
      <section className="card auth-card" aria-labelledby="auth-title">
        <header>
          <strong>Autonomous CFO</strong>
          <LanguageSwitcher />
        </header>
        <div className="auth-heading">
          <h1 id="auth-title">{labels[mode]}</h1>
          <p>{guidance[mode]}</p>
        </div>
        <DeliveryNotice receipt={receipt} email={email} />
        <form id="auth-form" key={mode} className="account-form" onSubmit={submit}>
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
          {['login', 'signup', 'forgot'].includes(mode) && (
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
          {['login', 'signup', 'reset'].includes(mode) && (
            <Field
              name="password"
              label={
                mode === 'reset'
                  ? t('New password', 'Nowe hasło')
                  : t('Password', 'Hasło')
              }
              type="password"
              minLength={10}
              maxLength={256}
              autoComplete={
                ['signup', 'reset'].includes(mode)
                  ? 'new-password'
                  : 'current-password'
              }
            />
          )}
          {mode === 'reset' && <RepeatPassword />}
          {['signup', 'reset'].includes(mode) && (
            <small>
              {t('Use at least 10 characters.', 'Użyj co najmniej 10 znaków.')}
            </small>
          )}
          {error && <p role="alert">{t(error)}</p>}
          <button disabled={busy} className="btn btn-primary">
            {labels[mode]}
          </button>
        </form>
        {notice && (
          <p role="status">
            {
              {
                verified: t(
                  'Email verified. You can now sign in.',
                  'Adres e-mail potwierdzony. Możesz się teraz zalogować.',
                ),
                changed: t(
                  'Password updated. Sign in with your new password.',
                  'Hasło zmienione. Zaloguj się nowym hasłem.',
                ),
                resent: t(
                  'Code requested. Use the newest message for this address.',
                  'Poproszono o kod. Użyj najnowszej wiadomości dla tego adresu.',
                ),
              }[notice]
            }
          </p>
        )}
        <nav aria-label={t('Account options', 'Opcje konta')}>
          {mode === 'login' ? (
            <>
              <button
                disabled={busy}
                className="btn btn-ghost"
                onClick={() => change('signup')}
              >
                {labels.signup}
              </button>
              <button
                disabled={busy}
                className="btn btn-ghost"
                onClick={() => change('forgot')}
              >
                {t('Forgot password?', 'Nie pamiętasz hasła?')}
              </button>
            </>
          ) : (
            <button
              disabled={busy}
              className="btn btn-ghost"
              onClick={() => change('login')}
            >
              {t('Back to sign in', 'Powrót do logowania')}
            </button>
          )}
          {mode === 'forgot' && (
            <button
              disabled={busy}
              className="btn btn-ghost"
              type="submit" form="auth-form" value="existingCode"
            >
              {t('I have a code', 'Mam kod')}
            </button>
          )}
          {confirmation && email && (
            <button disabled={busy} className="btn btn-ghost" onClick={resend}>
              {t('Resend code', 'Wyślij kod ponownie')}
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
  const [delivery, setDelivery] = useState(null);
  const labels = {
    names: t('Edit name', 'Zmień dane'),
    email: t('Change email', 'Zmień e-mail'),
    confirm: t('Confirm new email', 'Potwierdź nowy adres'),
    password: t('Change password', 'Zmień hasło'),
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
        const receipt = await api('account/change-email', fields);
        setDelivery({ receipt, email: fields.email });
        setMode('confirm');
        return;
      }
      if (action === 'confirm') {
        await api('account/confirm', { ...fields, email: user.email, purpose: 'email' });
        setUser(await api('account/me'));
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
          {['names', 'email', 'password', 'logout', 'delete'].map(
            (action) => (
              <button
                key={action}
                disabled={busy}
                type="button"
                className={
                  'btn ' + (action === 'delete' ? 'btn-danger' : 'btn-ghost')
                }
                onClick={() => {
                  setMsg('');
                  setError('');
                  setDelivery(null);
                  if (action === 'logout') run(action);
                  else setMode(action);
                }}
              >
                {labels[action]}
              </button>
            ),
          )}
        </div>
      ) : (
        <form
          key={mode}
          className="account-form"
          onSubmit={(e) => {
            e.preventDefault();
            const fields = Object.fromEntries(new FormData(e.currentTarget));
            let question;
            if (mode === 'names') {
              const name = [fields.first_name.trim(), fields.last_name.trim()].join(' ');
              question = t(`Save your name as ${name}?`, `Zapisać imię i nazwisko jako ${name}?`);
            } else if (mode === 'email') {
              question = t(`Send a verification code to ${fields.email}?`, `Wysłać kod na adres ${fields.email}?`);
            } else if (mode === 'password') {
              question = t('Change your password and sign out?', 'Zmienić hasło i wylogować się?');
            } else if (mode === 'delete') {
              question = t('Permanently delete your account and workspace?', 'Trwale usunąć konto i jego dane?');
            }
            if (!question || window.confirm(question)) run(mode, fields);
          }}
        >
          {mode === 'confirm' && delivery && (
            <DeliveryNotice {...delivery} />
          )}
          {mode === 'names' &&
            [
              ['first_name', t('First name', 'Imię')],
              ['last_name', t('Last name', 'Nazwisko')],
            ].map(([key, label]) => (
              <label key={key}>
                {label}
                <input
                  name={key}
                  required
                  maxLength={100}
                  defaultValue={user[key]}
                />
              </label>
            ))}
          {mode === 'email' && (
            <Field
              name="email"
              label={t('New email', 'Nowy e-mail')}
              type="email"
            />
          )}
          {mode === 'confirm' && (
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
              label={t('Current password', 'Obecne hasło')}
              type="password"
              autoComplete="current-password"
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
          <button
            disabled={busy}
            className={
              'btn ' + (mode === 'delete' ? 'btn-danger' : 'btn-primary')
            }
          >
            {mode === 'delete' ? labels.delete : mode === 'confirm' ? labels.confirm : t('Save', 'Zapisz')}
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
