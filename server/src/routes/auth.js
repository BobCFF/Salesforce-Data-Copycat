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

// Build an OAuth2 helper bound to a specific login URL (production vs sandbox).
function oauth2(loginUrl = 'https://login.salesforce.com') {
  return new jsforce.OAuth2({
    loginUrl,
    clientId: config.oauth.clientId,
    clientSecret: config.oauth.clientSecret,
    redirectUri: config.oauth.redirectUri,
  });
}

// Overall status of both connections.
router.get('/status', (req, res) => {
  res.json({
    oauthEnabled: config.oauthEnabled,
    source: statusView(req, 'source'),
    target: statusView(req, 'target'),
  });
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
    res.json({ side, ...statusView(req, side) });
  } catch (err) {
    // Surface Salesforce login errors clearly without leaking secrets.
    const message = err?.message || 'Login failed.';
    res.status(401).json({ error: message });
  }
});

router.post('/disconnect/:side', (req, res) => {
  const { side } = req.params;
  if (!isValidSide(side)) return res.status(400).json({ error: 'Invalid side.' });
  clearCredentials(req, side);
  res.json({ side, connected: false });
});

router.post('/disconnect', (req, res) => {
  for (const side of SIDES) clearCredentials(req, side);
  req.session.destroy(() => {
    res.clearCookie('sfcopycat.sid');
    res.json({ ok: true });
  });
});

// -------- OAuth2 web-server flow (optional) --------

// Kick off OAuth for a side. Requires a Connected App to be configured.
router.get('/oauth/login/:side', (req, res) => {
  if (!config.oauthEnabled) return res.status(400).json({ error: 'OAuth is not configured on the server.' });
  const { side } = req.params;
  if (!isValidSide(side)) return res.status(400).json({ error: 'Invalid side.' });
  const loginUrl = req.query.loginUrl || 'https://login.salesforce.com';
  req.session.oauthPending = { side, loginUrl };
  const auth = oauth2(loginUrl);
  const url = auth.getAuthorizationUrl({ scope: 'api refresh_token', prompt: 'login' });
  res.redirect(url);
});

router.get('/oauth/callback', async (req, res, next) => {
  if (!config.oauthEnabled) return res.status(400).send('OAuth is not configured.');
  const pending = req.session.oauthPending;
  if (!pending) return res.status(400).send('No pending OAuth request.');
  const { side, loginUrl } = pending;
  try {
    const conn = new jsforce.Connection({
      oauth2: oauth2(loginUrl),
      version: config.apiVersion,
    });
    await conn.authorize(req.query.code);
    const ident = await conn.identity();
    setCredentials(req, side, {
      instanceUrl: conn.instanceUrl,
      accessToken: conn.accessToken,
      refreshToken: conn.refreshToken,
      loginUrl,
      userInfo: {
        id: ident.user_id,
        organizationId: ident.organization_id,
        username: ident.username,
        displayName: ident.display_name,
        url: conn.instanceUrl,
      },
    });
    delete req.session.oauthPending;
    // Redirect back to the SPA.
    const target = config.clientOrigins[0] || '/';
    res.redirect(`${target}/?connected=${side}`);
  } catch (err) {
    next(err);
  }
});

export default router;
