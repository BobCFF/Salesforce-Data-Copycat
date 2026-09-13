import React, { useState } from 'react';
import { api } from '../api.js';
import ConnectForm from './ConnectForm.jsx';

function downloadFile(filename, text) {
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Modal for managing the saved connection registry: add new org logins, pick
// which one is source / target, and remove ones you no longer need.
export default function ConnectionsDialog({ status, onClose, onChange }) {
  const connections = status?.connections || [];
  const roles = status?.roles || { source: null, target: null };
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function apply(fn) {
    setBusy(true);
    setError('');
    try {
      await fn();
      await onChange();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const setRole = (side, id) =>
    apply(() => api.setRoles({ [side]: id || null }));

  const remove = (id) => apply(() => api.removeConnection(id));

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal connections-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          Connections
          <button className="modal-x" onClick={onClose} title="Close">✕</button>
        </div>

        <div className="modal-body">
          <p className="muted small">
            Add each org once, then choose which saved connection acts as the <strong>source</strong> and
            which acts as the <strong>target</strong>. Credentials are stored only in your encrypted session.
          </p>

          {connections.length > 0 ? (
            <table className="conn-table">
              <thead>
                <tr>
                  <th>Connection</th>
                  <th>Source</th>
                  <th>Target</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {connections.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <div className="conn-name">{c.label}</div>
                      <div className="muted small">{c.username || c.instanceUrl}</div>
                      <div className="muted small">{c.instanceUrl}</div>
                    </td>
                    <td className="center">
                      <input
                        type="radio"
                        name="role-source"
                        checked={roles.source === c.id}
                        disabled={busy}
                        onChange={() => setRole('source', c.id)}
                      />
                    </td>
                    <td className="center">
                      <input
                        type="radio"
                        name="role-target"
                        checked={roles.target === c.id}
                        disabled={busy}
                        onChange={() => setRole('target', c.id)}
                      />
                    </td>
                    <td className="center">
                      <button
                        className="btn small danger"
                        disabled={busy}
                        onClick={() => remove(c.id)}
                        title="Remove this connection"
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="muted">No connections yet — add one below.</p>
          )}

          {connections.length > 0 && (
            <div className="role-actions">
              <button className="btn small" disabled={busy} onClick={() => apply(() => api.swapConnections())}>
                ⇄ Swap source / target
              </button>
              <button className="btn small" disabled={busy} onClick={() => setRole('source', null)}>
                Clear source
              </button>
              <button className="btn small" disabled={busy} onClick={() => setRole('target', null)}>
                Clear target
              </button>
            </div>
          )}

          {error && <div className="conn-error">{error}</div>}

          <div className="add-conn">
            <h4>Add a connection</h4>
            <ConnectForm oauthEnabled={status?.oauthEnabled} onConnected={onChange} />
          </div>

          <BackupSection connections={connections} onChange={onChange} />
        </div>
      </div>
    </div>
  );
}

// Encrypted export / import of the saved connections. The passphrase never
// leaves as anything reusable — the file is AES-256-GCM encrypted server-side.
function BackupSection({ connections, onChange }) {
  const [mode, setMode] = useState('none'); // 'none' | 'export' | 'import'
  const [pass1, setPass1] = useState('');
  const [pass2, setPass2] = useState('');
  const [importPass, setImportPass] = useState('');
  const [envelope, setEnvelope] = useState(null);
  const [fileName, setFileName] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  function reset() {
    setPass1('');
    setPass2('');
    setImportPass('');
    setEnvelope(null);
    setFileName('');
    setMsg('');
    setErr('');
  }

  async function doExport() {
    setErr('');
    setMsg('');
    if (pass1.length < 8) return setErr('Use a passphrase of at least 8 characters.');
    if (pass1 !== pass2) return setErr('Passphrases do not match.');
    setBusy(true);
    try {
      const env = await api.exportConnections({ passphrase: pass1 });
      const stamp = new Date().toISOString().slice(0, 10);
      downloadFile(`salesforce-connections-${stamp}.scc.json`, JSON.stringify(env, null, 2));
      setMsg(`Exported ${env.count} connection${env.count === 1 ? '' : 's'} — keep the file and passphrase safe.`);
      setPass1('');
      setPass2('');
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function onFile(e) {
    setErr('');
    setMsg('');
    setEnvelope(null);
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    try {
      const text = await file.text();
      setEnvelope(JSON.parse(text));
    } catch {
      setErr('That file is not valid JSON.');
    }
  }

  async function doImport() {
    setErr('');
    setMsg('');
    if (!envelope) return setErr('Choose an export file first.');
    if (!importPass) return setErr('Enter the passphrase used when exporting.');
    setBusy(true);
    try {
      const res = await api.importConnections({ passphrase: importPass, envelope });
      setMsg(`Imported ${res.added} connection${res.added === 1 ? '' : 's'}${res.skipped ? `, skipped ${res.skipped} duplicate/invalid` : ''}.`);
      setImportPass('');
      setEnvelope(null);
      setFileName('');
      await onChange();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="backup-section">
      <h4>Backup &amp; transfer</h4>
      <div className="role-actions">
        <button
          className={`btn small${mode === 'export' ? ' active' : ''}`}
          disabled={busy || !connections.length}
          onClick={() => { reset(); setMode(mode === 'export' ? 'none' : 'export'); }}
          title={connections.length ? '' : 'Add a connection first'}
        >
          ⬆ Export…
        </button>
        <button
          className={`btn small${mode === 'import' ? ' active' : ''}`}
          disabled={busy}
          onClick={() => { reset(); setMode(mode === 'import' ? 'none' : 'import'); }}
        >
          ⬇ Import…
        </button>
      </div>

      {mode === 'export' && (
        <div className="backup-form">
          <p className="muted small">
            Downloads an <strong>encrypted</strong> file containing all {connections.length} connection(s),
            including access tokens and secrets. Anyone with the file <em>and</em> this passphrase can use your
            org credentials — store both safely.
          </p>
          <input type="password" placeholder="Passphrase (min 8 characters)" value={pass1} autoComplete="new-password" onChange={(e) => setPass1(e.target.value)} />
          <input type="password" placeholder="Confirm passphrase" value={pass2} autoComplete="new-password" onChange={(e) => setPass2(e.target.value)} />
          <button className="btn primary" disabled={busy} onClick={doExport}>
            {busy ? 'Encrypting…' : 'Download encrypted file'}
          </button>
        </div>
      )}

      {mode === 'import' && (
        <div className="backup-form">
          <p className="muted small">
            Choose a previously exported file and enter its passphrase. Existing duplicates are skipped.
          </p>
          <input type="file" accept=".json,application/json" onChange={onFile} />
          {fileName && <div className="muted small">Selected: {fileName}</div>}
          <input type="password" placeholder="Passphrase" value={importPass} autoComplete="off" onChange={(e) => setImportPass(e.target.value)} />
          <button className="btn primary" disabled={busy || !envelope} onClick={doImport}>
            {busy ? 'Importing…' : 'Import connections'}
          </button>
        </div>
      )}

      {err && <div className="conn-error">{err}</div>}
      {msg && <div className="backup-ok">{msg}</div>}
    </div>
  );
}
