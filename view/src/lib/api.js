export async function api(path, body) {
  const response = await fetch(
    '/api/' + path,
    body === undefined
      ? {}
      : {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-CFO-Client': 'dashboard' },
          body: JSON.stringify(body),
        },
  );
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    const detail = Array.isArray(data.detail)
      ? data.detail.map((e) => e.loc.slice(1).join('.') + ' ' + e.msg).join(', ')
      : data.detail;
    const error = new Error(detail || 'Request failed (HTTP ' + response.status + ')');
    error.status = response.status;
    if (response.status === 401 && !path.startsWith('account/')) {
      window.dispatchEvent(new Event('cfo-session-expired'));
    }
    throw error;
  }
  return response.json();
}

const currency = new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR' });
export const eur = (value) => currency.format(value);
export function nextDay(day) {
  const date = new Date(day + 'T00:00:00Z');
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}
