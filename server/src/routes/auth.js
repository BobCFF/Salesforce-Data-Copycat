import crypto from 'node:crypto';
import express from 'express';
import jsforce from 'jsforce';
import config from '../config.js';
import { loginWithPassword, loginWithToken } from '../salesforce.js';
import {
  SIDES,
  isValidSide,
  addConnection,
  removeConnection,
  autoAssignRole,
  setRoles,
  swapRoles,
  listConnections,
  rolesView,
  statusView,
} from '../connections.js';

const router = express.Router();

// Resolve the OAuth Connected App config for this request: prefer the config
// the user saved into their (encrypted) session; fall back to server env vars.
function resolveOAuthApp(req) {
  const s = req.session?.oauthApp;
  if (s && s.clientId && s.clientSecret && s.redirectUri) {
    return { ...s, source: 'session' };
  }
  if (config.oauthEnabled) {
    return { ...config.oauth, source: 'env' };
  }
  return null;
}

function base64url(buf) {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// Build an OAuth2 helper bound to a login URL and a given app config.
function oauth2(loginUrl, app) {
  return new jsforce.OAuth2({
    loginUrl: loginUrl || 'https://login.salesforce.com',
    clientId: app.clientId,
    clientSecret: app.clientSecret,
    redirectUri: app.redirectUri,
  });
}

// The full connections + roles + status payload the client needs.
function connectionsPayload(req) {
  return {
    oauthEnabled: Boolean(resolveOAuthApp(req)),
    connections: listConnections(req),
    roles: rolesView(req),
    source: statusView(req, 'source'),
    target: statusView(req, 'target'),
  };
}

router.get('/status', (req, res) => {
  res.json(connectionsPayload(req));
});

router.get('/connections', (req, res) => {
  res.json({ connections: listConnections(req), roles: rolesView(req) });
});

// -------- OAuth Connected App configuration (stored in the session) --------

router.get('/oauth/config', (req, res) => {
  const app = resolveOAuthApp(req);
  res.json({
    configured: Boolean(app),
    source: app?.source || null,
    clientId: app?.clientId || '',
    redirectUri: app?.redirectUri || config.oauth.redirectUri,
    hasSecret: Boolean(app?.clientSecret),
  });
});

router.post('/oauth/config', async (req, res) => {
  const { clientId, clientSecret, redirectUri } = req.body || {};
  if (!clientId || !clientSecret || !redirectUri) {
    return res.status(400).json({ error: 'clientId, clientSecret and redirectUri are required.' });
  }
  req.session.oauthApp = {
    clientId: String(clientId).trim(),
    clientSecret: String(clientSecret).trim(),
    redirectUri: String(redirectUri).trim(),
  };
  await req.session.save();
  res.json({ configured: true, source: 'session', clientId: req.session.oauthApp.clientId, redirectUri: req.session.oauthApp.redirectUri, hasSecret: true });
});

router.post('/oauth/config/clear', async (req, res) => {
  delete req.session.oauthApp;
  await req.session.save();
  res.json({ configured: Boolean(resolveOAuthApp(req)) });
});

// -------- Connections (named org logins) --------

// Create a connection via username/password (+ token) or an access token.
router.post('/connect', async (req, res) => {
  const { method = 'password', role, label } = req.body || {};
  try {
    let creds;
    if (method === 'token') {
      const { instanceUrl, accessToken } = req.body;
      if (!instanceUrl || !accessToken) {
        return res.status(400).json({ error: 'instanceUrl and accessToken are required.' });
      }
      creds = await loginWithToken({ instanceUrl, accessToken });
    } else {
      const { loginUrl, username, password, securityToken } = req.body;
      if (!username || !password) {
        return res.status(400).json({ error: 'username and password are required.' });
      }
      creds = await loginWithPassword({ loginUrl, username, password, securityToken });
    }
    creds.method = method;
    if (label) creds.label = String(label).trim();
    const id = addConnection(req, creds);
    if (role && SIDES.includes(role)) setRoles(req, { [role]: id });
    else autoAssignRole(req, id);
    await req.session.save();
    res.json({ id, ...connectionsPayload(req) });
  } catch (err) {
    res.status(401).json({ error: err?.message || 'Login failed.' });
  }
});

// Assign source/target roles.
router.post('/connections/roles', async (req, res) => {
  const { source, target } = req.body || {};
  setRoles(req, { source, target });
  await req.session.save();
  res.json(connectionsPayload(req));
});

router.post('/connections/swap', async (req, res) => {
  swapRoles(req);
  await req.session.save();
  res.json(connectionsPayload(req));
});

// Remove a connection.
router.delete('/connections/:id', async (req, res) => {
  removeConnection(req, req.params.id);
  await req.session.save();
  res.json(connectionsPayload(req));
});

// Log out of everything.
router.post('/disconnect', (req, res) => {
  req.session.destroy();
  res.json({ ok: true });
});

// -------- OAuth2 web-server flow --------

// Kick off OAuth to create a connection (optionally assigned to a role).
router.get('/oauth/login', async (req, res) => {
  const app = resolveOAuthApp(req);
  if (!app) return res.status(400).json({ error: 'OAuth is not configured. Add a Connected App in OAuth settings first.' });
  const loginUrl = req.query.loginUrl || 'https://login.salesforce.com';
  const role = SIDES.includes(req.query.role) ? req.query.role : null;
  const label = req.query.label ? String(req.query.label) : '';
  // PKCE (S256) — required by Connected Apps that enforce Proof Key for Code Exchange.
  const codeVerifier = base64url(crypto.randomBytes(32));
  const codeChallenge = base64url(crypto.createHash('sha256').update(codeVerifier).digest());
  req.session.oauthPending = { loginUrl, role, label, codeVerifier };
  await req.session.save();
  const auth = oauth2(loginUrl, app);
  const url = auth.getAuthorizationUrl({
    scope: 'api refresh_token',
    prompt: 'login',
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  });
  res.redirect(url);
});

router.get('/oauth/callback', async (req, res, next) => {
  const app = resolveOAuthApp(req);
  if (!app) return res.status(400).send('OAuth is not configured.');
  const pending = req.session.oauthPending;
  if (!pending) return res.status(400).send('No pending OAuth request.');
  const { loginUrl, role, label, codeVerifier } = pending;
  try {
    const conn = new jsforce.Connection({
      oauth2: oauth2(loginUrl, app),
      version: config.apiVersion,
    });
    await conn.authorize(req.query.code, codeVerifier ? { code_verifier: codeVerifier } : undefined);
    const ident = await conn.identity();
    const id = addConnection(req, {
      method: 'oauth',
      label: label || ident.username,
      instanceUrl: conn.instanceUrl,
      accessToken: conn.accessToken,
      refreshToken: conn.refreshToken,
      loginUrl,
      oauth: { clientId: app.clientId, clientSecret: app.clientSecret, redirectUri: app.redirectUri },
      userInfo: {
        id: ident.user_id,
        organizationId: ident.organization_id,
        username: ident.username,
        displayName: ident.display_name,
        url: conn.instanceUrl,
      },
    });
    if (role && SIDES.includes(role)) setRoles(req, { [role]: id });
    else autoAssignRole(req, id);
    delete req.session.oauthPending;
    await req.session.save();
    const target = config.isServerless ? '' : config.clientOrigins[0] || '';
    res.redirect(`${target}/?connected=1`);
  } catch (err) {
    next(err);
  }
});

export default router;
