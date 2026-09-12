import React, { useEffect, useState } from 'react';
import { api } from '../api.js';

// Modal for entering a Salesforce Connected App's OAuth config. The values are
// stored only in the encrypted server-side session (not env vars, not the repo,
// not the browser). The client secret is never read back from the server.
export default function OAuthSettings({ onClose, onChange }) {
  const defaultRedirect = `${window.location.origin}/api/oauth/callback`;
  const [form, setForm] = useState({ clientId: '', clientSecret: '', redirectUri: defaultRedirect });
  const [current, setCurrent] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .getOAuthConfig()
      .then((c) => {
        setCurrent(c);
        setForm((f) => ({
          ...f,
          clientId: c.clientId || f.clientId,
          redirectUri: c.redirectUri || f.redirectUri,
        }));
      })
      .catch((e) => setError(e.message));
  }, []);

  function update(k, v) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api.setOAuthConfig(form);
      onChange?.();
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function clear() {
    setBusy(true);
    setError('');
    try {
      await api.clearOAuthConfig();
      onChange?.();
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={save}>
        <div className="modal-head">
          OAuth (Connected App) settings
          <button type="button" className="modal-x" onClick={onClose} title="Close">✕</button>
        </div>
        <div className="modal-body">
          <p className="oauth-note">
            Enter your Salesforce Connected App's OAuth credentials. They are stored only in your
            encrypted server session — never in environment variables, the repository, or your browser.
            {current?.source === 'env' && ' (Server env vars are currently in use; saving here overrides them for your session.)'}
          </p>

          <label className="oauth-field">
            <span>Consumer Key (Client ID)</span>
            <input type="text" value={form.clientId} autoComplete="off" onChange={(e) => update('clientId', e.target.value)} />
          </label>

          <label className="oauth-field">
            <span>Consumer Secret (Client Secret){current?.hasSecret ? ' — leave to replace' : ''}</span>
            <input type="password" value={form.clientSecret} autoComplete="off" placeholder={current?.hasSecret ? '•••••••• (stored)' : ''} onChange={(e) => update('clientSecret', e.target.value)} />
          </label>

          <label className="oauth-field">
            <span>Callback / Redirect URI</span>
            <input type="text" value={form.redirectUri} onChange={(e) => update('redirectUri', e.target.value)} />
          </label>
          <p className="oauth-hint">
            Add this exact Callback URL to the Connected App, and enable OAuth scopes <code>api</code> and{' '}
            <code>refresh_token</code>.
          </p>

          {error && <div className="conn-error">{error}</div>}
        </div>
        <div className="modal-foot">
          {current?.source === 'session' && (
            <button type="button" className="btn" onClick={clear} disabled={busy}>Forget</button>
          )}
          <span className="spacer" />
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn primary" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
        </div>
      </form>
    </div>
  );
}
