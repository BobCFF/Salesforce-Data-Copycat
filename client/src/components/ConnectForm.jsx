import React, { useState } from 'react';
import { api } from '../api.js';

const KNOWN_HOSTS = ['https://login.salesforce.com', 'https://test.salesforce.com'];
const cleanUrl = (u) => (u || '').trim().replace(/\/+$/, '');

// A single, role-agnostic form for adding a new named connection. On success
// it calls onConnected() so the parent can refresh the connection list. An
// `initial` prop pre-fills the form (used when re-authing an imported profile);
// remount the component (via key) to adopt new initial values.
export default function ConnectForm({ oauthEnabled, onConnected, initial }) {
  const [method, setMethod] = useState(initial?.method === 'token' ? 'token' : 'password');
  const [form, setForm] = useState({
    label: initial?.label || '',
    loginUrl: initial?.loginUrl || 'https://login.salesforce.com',
    username: initial?.username || '',
    password: '',
    securityToken: '',
    instanceUrl: initial?.instanceUrl || '',
    accessToken: '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  function update(k, v) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function connect(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const payload =
        method === 'token'
          ? {
              method: 'token',
              label: form.label,
              instanceUrl: form.instanceUrl,
              accessToken: form.accessToken,
            }
          : {
              method: 'password',
              label: form.label,
              loginUrl: cleanUrl(form.loginUrl),
              username: form.username,
              password: form.password,
              securityToken: form.securityToken,
            };
      await api.createConnection(payload);
      // Clear secrets after a successful add.
      setForm((f) => ({ ...f, password: '', securityToken: '', accessToken: '', label: '' }));
      onConnected();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const oauthHref = `/api/oauth/login?loginUrl=${encodeURIComponent(cleanUrl(form.loginUrl))}${
    form.label ? `&label=${encodeURIComponent(form.label.trim())}` : ''
  }`;

  return (
    <form className="conn-form" onSubmit={connect}>
      <input
        type="text"
        placeholder="Connection name (optional, e.g. “Prod” or “UAT Sandbox”)"
        value={form.label}
        autoComplete="off"
        onChange={(e) => update('label', e.target.value)}
      />

      <div className="method-tabs">
        <label className={method === 'password' ? 'active' : ''}>
          <input
            type="radio"
            name="new-conn-method"
            checked={method === 'password'}
            onChange={() => setMethod('password')}
          />
          Username / Password
        </label>
        <label className={method === 'token' ? 'active' : ''}>
          <input
            type="radio"
            name="new-conn-method"
            checked={method === 'token'}
            onChange={() => setMethod('token')}
          />
          Access Token
        </label>
      </div>

      {method === 'password' ? (
        <>
          <select
            value={KNOWN_HOSTS.includes(form.loginUrl) ? form.loginUrl : '__custom__'}
            onChange={(e) => update('loginUrl', e.target.value === '__custom__' ? '' : e.target.value)}
          >
            <option value="https://login.salesforce.com">Production / Developer</option>
            <option value="https://test.salesforce.com">Sandbox</option>
            <option value="__custom__">Custom domain (My Domain)…</option>
          </select>
          {!KNOWN_HOSTS.includes(form.loginUrl) && (
            <input
              type="text"
              placeholder="https://your-domain.my.salesforce.com"
              value={form.loginUrl}
              autoComplete="off"
              onChange={(e) => update('loginUrl', e.target.value)}
            />
          )}
          <input
            type="text"
            placeholder="Username (user@example.com)"
            value={form.username}
            autoComplete="off"
            onChange={(e) => update('username', e.target.value)}
          />
          <input
            type="password"
            placeholder="Password"
            value={form.password}
            autoComplete="off"
            onChange={(e) => update('password', e.target.value)}
          />
          <input
            type="password"
            placeholder="Security token (if required)"
            value={form.securityToken}
            autoComplete="off"
            onChange={(e) => update('securityToken', e.target.value)}
          />
        </>
      ) : (
        <>
          <input
            type="text"
            placeholder="Instance URL (https://xxx.my.salesforce.com)"
            value={form.instanceUrl}
            onChange={(e) => update('instanceUrl', e.target.value)}
          />
          <input
            type="password"
            placeholder="Access token / session id"
            value={form.accessToken}
            autoComplete="off"
            onChange={(e) => update('accessToken', e.target.value)}
          />
        </>
      )}

      <div className="conn-actions">
        <button className="btn primary" type="submit" disabled={busy}>
          {busy ? 'Connecting…' : '+ Add connection'}
        </button>
        {oauthEnabled && method === 'password' && (
          <a className="btn" href={oauthHref}>
            Log in with Salesforce
          </a>
        )}
      </div>
      {error && <div className="conn-error">{error}</div>}
    </form>
  );
}
