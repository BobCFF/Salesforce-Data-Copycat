import React from 'react';

// Slide-over menu: appearance (theme), layout options, connection setup help,
// and OAuth configuration. Preferences persist via the parent's state.
export default function SettingsDrawer({
  onClose,
  theme,
  setTheme,
  dockBottom,
  setDockBottom,
  treeSidebar,
  setTreeSidebar,
  onOpenOAuth,
  onManageConnections,
  onLogout,
  connected,
}) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <aside className="drawer" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          Menu
          <button className="modal-x" onClick={onClose} title="Close">✕</button>
        </div>
        <div className="drawer-body">
          {/* -------- Appearance -------- */}
          <section className="drawer-section">
            <h3>Appearance</h3>
            <div className="seg">
              {['system', 'light', 'dark'].map((t) => (
                <button
                  key={t}
                  className={`seg-btn${theme === t ? ' active' : ''}`}
                  onClick={() => setTheme(t)}
                >
                  {t === 'system' ? '🖥 System' : t === 'light' ? '☀ Light' : '🌙 Dark'}
                </button>
              ))}
            </div>
          </section>

          {/* -------- Layout -------- */}
          <section className="drawer-section">
            <h3>Layout</h3>
            <div className="drawer-field">
              <div className="drawer-label">Results position</div>
              <div className="seg">
                <button className={`seg-btn${dockBottom ? ' active' : ''}`} onClick={() => setDockBottom(true)}>⤓ Bottom</button>
                <button className={`seg-btn${!dockBottom ? ' active' : ''}`} onClick={() => setDockBottom(false)}>⤒ Right</button>
              </div>
            </div>
            <div className="drawer-field">
              <div className="drawer-label">Source Objects</div>
              <div className="seg">
                <button className={`seg-btn${!treeSidebar ? ' active' : ''}`} onClick={() => setTreeSidebar(false)}>In panel</button>
                <button className={`seg-btn${treeSidebar ? ' active' : ''}`} onClick={() => setTreeSidebar(true)}>Full-height sidebar</button>
              </div>
            </div>
            <p className="drawer-hint">All panels are also drag-resizable, and column widths / order persist per object.</p>
          </section>

          {/* -------- Connections -------- */}
          <section className="drawer-section">
            <h3>Connections</h3>
            <button className="btn block" onClick={onManageConnections}>🔌 Manage connections…</button>
            <button className="btn block" onClick={onOpenOAuth}>⚙ Configure OAuth (Connected App)…</button>
            {connected && (
              <button className="btn block" onClick={() => { onClose(); onLogout(); }}>Log out all connections</button>
            )}

            <p className="drawer-hint">
              Save each org once in <strong>Manage connections…</strong>, then pick which saved connection is the
              <strong> source</strong> and which is the <strong>target</strong> from the row on the main page (or use
              <strong> ⇄ Swap</strong>). Pick the login method that matches your org's security.
            </p>

            <details className="help">
              <summary>Username + password (+ security token)</summary>
              <p>
                Enter username and password. If logging in from outside your org's trusted IP ranges you must append a
                <strong> security token</strong>: Salesforce → your avatar → <em>Settings → Reset My Security Token</em>
                (it's emailed to you). Put it in the <em>Security token</em> field — the app appends it for you.
              </p>
              <p className="muted small">
                Note: This SOAP login is blocked when your org enforces MFA on API logins or uses SSO-only accounts —
                use OAuth or an access token instead (below).
              </p>
            </details>

            <details className="help">
              <summary>MFA, Passkeys &amp; SSO (recommended: OAuth)</summary>
              <p>
                Salesforce requires <strong>multi-factor authentication (MFA)</strong> for interactive logins, and many
                orgs use <strong>Passkeys / WebAuthn</strong> (Face ID, Touch ID, security keys) or <strong>SSO</strong>
                (SAML / OpenID Connect via your IdP). Passwords + security token <em>cannot</em> satisfy these.
              </p>
              <p>
                For these orgs, use <strong>Log in with Salesforce (OAuth)</strong>: you're redirected to Salesforce's own
                login page, where you complete MFA, a passkey, or your SSO/IdP flow — this app never sees your password or
                second factor. It only receives an access token (and a refresh token, so it stays connected).
              </p>
              <ol className="muted small">
                <li>Set up a <strong>Connected App</strong> in Salesforce (Setup → App Manager → New Connected App).</li>
                <li>Enable OAuth; add the callback URL shown in <em>Configure OAuth…</em>; scopes <code>api</code> + <code>refresh_token</code>.</li>
                <li>Leave <em>Require PKCE</em> off (this app uses the client-secret flow); relax IP restrictions.</li>
                <li>Paste the Consumer Key + Secret into <em>Configure OAuth…</em> (stored only in your encrypted session).</li>
                <li>On a connection card, pick Production/Sandbox and click <strong>Log in with Salesforce</strong>.</li>
              </ol>
            </details>

            <details className="help">
              <summary>Access token / session id (SSO shortcut)</summary>
              <p>
                If you can't create a Connected App, use the <strong>Access Token</strong> tab: run
                <code> sf org display --target-org &lt;alias&gt;</code> (or <code>sfdx force:org:display</code>) and paste the
                <em> Instance URL</em> and <em>Access Token</em>. This inherits whatever MFA/SSO you already completed in the
                CLI login. Access tokens are short-lived, so you may need to refresh them periodically.
              </p>
            </details>

            <details className="help">
              <summary>Common errors</summary>
              <ul className="muted small">
                <li><strong>LOGIN_MUST_USE_SECURITY_TOKEN</strong> — append your security token, or use OAuth.</li>
                <li><strong>redirect_uri_mismatch</strong> — the callback in <em>Configure OAuth…</em> must exactly match one on the Connected App.</li>
                <li><strong>OAUTH_APPROVAL_ERROR / not approved</strong> — set the Connected App's <em>Permitted Users</em> and relax IP restrictions.</li>
                <li><strong>INVALID_LOGIN / MFA required</strong> — the org blocks password API logins; use OAuth or an access token.</li>
              </ul>
            </details>
          </section>
        </div>
      </aside>
    </div>
  );
}
