import { connectionFromCredentials } from './salesforce.js';

export const SIDES = ['source', 'target'];

export function isValidSide(side) {
  return SIDES.includes(side);
}

/**
 * Read the stored credentials for a side from the session.
 * @returns {import('./salesforce.js').StoredCredentials|null}
 */
export function getCredentials(req, side) {
  const store = req.session?.orgs || {};
  return store[side] || null;
}

export function setCredentials(req, side, creds) {
  if (!req.session.orgs) req.session.orgs = {};
  req.session.orgs[side] = creds;
}

export function clearCredentials(req, side) {
  if (req.session?.orgs) delete req.session.orgs[side];
}

/**
 * Build a live jsforce Connection for a side, or throw a 400-style error if
 * the side is not connected.
 *
 * When OAuth is configured and a refresh token is present, jsforce transparently
 * refreshes an expired access token and emits a "refresh" event; we capture the
 * new token into the session credentials and flag the request so the session is
 * re-saved (see maybeSaveRefreshed) — keeping the connection alive without a
 * re-login.
 */
export function requireConnection(req, side) {
  if (!isValidSide(side)) {
    const err = new Error(`Unknown side "${side}". Expected "source" or "target".`);
    err.status = 400;
    throw err;
  }
  const creds = getCredentials(req, side);
  if (!creds) {
    const err = new Error(`Not connected to the ${side} org.`);
    err.status = 401;
    throw err;
  }
  const conn = connectionFromCredentials(creds);
  conn.on('refresh', (accessToken) => {
    const current = req.session?.orgs?.[side];
    if (current && accessToken) {
      current.accessToken = accessToken;
      req.__sessionRefreshed = true;
    }
  });
  return conn;
}

/**
 * If a token refresh updated the session during this request, persist it.
 * Must run before the response headers are sent (writes Set-Cookie).
 */
export async function maybeSaveRefreshed(req) {
  if (req.__sessionRefreshed) {
    req.__sessionRefreshed = false;
    await req.session.save();
  }
}

/**
 * A compact, safe view of a side's connection status for the client.
 */
export function statusView(req, side) {
  const creds = getCredentials(req, side);
  if (!creds) return { connected: false };
  return {
    connected: true,
    instanceUrl: creds.instanceUrl,
    loginUrl: creds.loginUrl,
    userInfo: creds.userInfo,
  };
}
