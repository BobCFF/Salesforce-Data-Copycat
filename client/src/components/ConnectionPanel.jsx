import React, { useState } from 'react';
import { api } from '../api.js';

// Login / status card for one org (source or target).
export default function ConnectionPanel({ side, status, oauthEnabled, onChange }) {
  const [method, setMethod] = useState('password');
  const [form, setForm] = useState({
    loginUrl: 'https://login.salesforce.com',
    username: '',
    password: '',
    securityToken: '',
    instanceUrl: '',
    accessToken: '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const connected = status?.connected;

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
          ? { method: 'token', instanceUrl: form.instanceUrl, accessToken: form.accessToken }
          : {
              method: 'password',
              loginUrl: form.loginUrl,
              username: form.username,
              password: form.password,
              securityToken: form.securityToken,
            };
      await api.connect(side, payload);
      onChange();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    setBusy(true);
    try {
      await api.disconnect(side);
      onChange();
    } finally {
      setBusy(false);
    }
  }

  const titleLabel = side === 'source' ? 'Source Org' : 'Target Org';

  return (
    <div className={`conn-card ${side}${connected ? ' connected' : ''}`}>
      <div className="conn-title">
        <span className={`led ${connected ? 'on' : 'off'}`} />
        {titleLabel}
      </div>

      {connected ? (
        <div className="conn-info">
          <button className="btn small disconnect-btn" onClick={disconnect} disabled={busy}>
            Disconnect
          </button>
          <div>
            <strong>{status.userInfo?.username || status.userInfo?.displayName || 'Connected'}</strong>
          </div>
          <div className="muted small">{status.instanceUrl}</div>
          <div className="muted small">Org: {status.userInfo?.organizationId}</div>
        </div>
      ) : (
        <form className="conn-form" onSubmit={connect}>
          <div className="method-tabs">
            <label className={method === 'password' ? 'active' : ''}>
              <input
                type="radio"
                name={`${side}-method`}
                checked={method === 'password'}
                onChange={() => setMethod('password')}
              />
              Username / Password
            </label>
            <label className={method === 'token' ? 'active' : ''}>
              <input
                type="radio"
                name={`${side}-method`}
                checked={method === 'token'}
                onChange={() => setMethod('token')}
              />
              Access Token
            </label>
          </div>

          {method === 'password' ? (
            <>
              <select value={form.loginUrl} onChange={(e) => update('loginUrl', e.target.value)}>
                <option value="https://login.salesforce.com">Production / Developer</option>
                <option value="https://test.salesforce.com">Sandbox</option>
              </select>
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
              {busy ? 'Connecting…' : 'Connect'}
            </button>
            {oauthEnabled && method === 'password' && (
              <a className="btn" href={`/api/oauth/login/${side}?loginUrl=${encodeURIComponent(form.loginUrl)}`}>
                Log in with Salesforce
              </a>
            )}
          </div>
          {error && <div className="conn-error">{error}</div>}
        </form>
      )}
    </div>
  );
}
