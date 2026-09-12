import express from 'express';
import jsforce from 'jsforce';
import config from '../config.js';
import { loginWithPassword, loginWithToken } from '../salesforce.js';
import {
  SIDES,
  isValidSide,
  setCredentials,
  clearCredentials,
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

// Build an OAuth2 helper bound to a login URL and a given app config.
function oauth2(loginUrl, app) {
  return new jsforce.OAuth2({
    loginUrl: loginUrl || 'https://login.salesforce.com',
    clientId: app.clientId,
    clientSecret: app.clientSecret,
    redirectUri: app.redirectUri,
  });
}

// Overall status of both connections.
router.get('/status', (req, res) => {
  res.json({
    oauthEnabled: Boolean(resolveOAuthApp(req)),
    source: statusView(req, 'source'),
    target: statusView(req, 'target'),
  });
});

// -------- OAuth Connected App configuration (stored in the session) --------

// Non-sensitive summary of the current OAuth app config (never returns the secret).
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

// Save the Connected App config into the session (client id + secret + redirect URI).
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

// Forget the session OAuth config.
router.post('/oauth/config/clear', async (req, res) => {
  delete req.session.oauthApp;
  await req.session.save();
  res.json({ configured: Boolean(resolveOAuthApp(req)) });
});

// Username/password (+ security token) or access-token login for a side.
router.post('/connect/:side', async (req, res, next) => {
  const { side } = req.params;
  if (!isValidSide(side)) return res.status(400).json({ error: 'Invalid side.' });

  const { method = 'password' } = req.body || {};
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
    setCredentials(req, side, creds);
    await req.session.save();
    res.json({ side, ...statusView(req, side) });
  } catch (err) {
    // Surface Salesforce login errors clearly without leaking secrets.
    const message = err?.message || 'Login failed.';
    res.status(401).json({ error: message });
  }
});

router.post('/disconnect/:side', async (req, res) => {
  const { side } = req.params;
  if (!isValidSide(side)) return res.status(400).json({ error: 'Invalid side.' });
  clearCredentials(req, side);
  await req.session.save();
  res.json({ side, connected: false });
});

router.post('/disconnect', (req, res) => {
  for (const side of SIDES) clearCredentials(req, side);
  // iron-session: destroy() clears the data and sends an expired cookie.
  req.session.destroy();
  res.json({ ok: true });
});

// -------- OAuth2 web-server flow (optional) --------

// Kick off OAuth for a side. Requires a Connected App to be configured.
router.get('/oauth/login/:side', async (req, res) => {
  const app = resolveOAuthApp(req);
  if (!app) return res.status(400).json({ error: 'OAuth is not configured. Add a Connected App in OAuth settings first.' });
  const { side } = req.params;
  if (!isValidSide(side)) return res.status(400).json({ error: 'Invalid side.' });
  const loginUrl = req.query.loginUrl || 'https://login.salesforce.com';
  req.session.oauthPending = { side, loginUrl };
  await req.session.save();
  const auth = oauth2(loginUrl, app);
  const url = auth.getAuthorizationUrl({ scope: 'api refresh_token', prompt: 'login' });
  res.redirect(url);
});

router.get('/oauth/callback', async (req, res, next) => {
  const app = resolveOAuthApp(req);
  if (!app) return res.status(400).send('OAuth is not configured.');
  const pending = req.session.oauthPending;
  if (!pending) return res.status(400).send('No pending OAuth request.');
  const { side, loginUrl } = pending;
  try {
    const conn = new jsforce.Connection({
      oauth2: oauth2(loginUrl, app),
      version: config.apiVersion,
    });
    await conn.authorize(req.query.code);
    const ident = await conn.identity();
    setCredentials(req, side, {
      instanceUrl: conn.instanceUrl,
      accessToken: conn.accessToken,
      refreshToken: conn.refreshToken,
      loginUrl,
      // Store the app config with the connection so token refresh works later,
      // independent of env vars.
      oauth: { clientId: app.clientId, clientSecret: app.clientSecret, redirectUri: app.redirectUri },
      userInfo: {
        id: ident.user_id,
        organizationId: ident.organization_id,
        username: ident.username,
        displayName: ident.display_name,
        url: conn.instanceUrl,
      },
    });
    delete req.session.oauthPending;
    await req.session.save();
    // Redirect back to the SPA. On a single-origin (serverless) deploy this is
    // the site root; in split dev it is the configured client origin.
    const target = config.isServerless ? '' : config.clientOrigins[0] || '';
    res.redirect(`${target}/?connected=${side}`);
  } catch (err) {
    next(err);
  }
});

export default router;
