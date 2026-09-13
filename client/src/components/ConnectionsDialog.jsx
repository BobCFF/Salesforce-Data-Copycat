import React, { useState } from 'react';
import { api } from '../api.js';
import ConnectForm from './ConnectForm.jsx';

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
        </div>
      </div>
    </div>
  );
}
