import crypto from 'node:crypto';
import { connectionFromCredentials } from './salesforce.js';

export const SIDES = ['source', 'target'];

export function isValidSide(side) {
  return SIDES.includes(side);
}

// ---------------------------------------------------------------------------
// Connections are named org logins stored in the session, keyed by id. Two
// role pointers (source/target) select which connection each side uses.
// ---------------------------------------------------------------------------

function store(req) {
  if (!req.session.connections) req.session.connections = {};
  return req.session.connections;
}

function roles(req) {
  if (!req.session.roles) req.session.roles = { source: null, target: null };
  return req.session.roles;
}

export function addConnection(req, creds) {
  const id = `c_${crypto.randomBytes(6).toString('hex')}`;
  store(req)[id] = creds;
  return id;
}

export function removeConnection(req, id) {
  delete store(req)[id];
  const r = roles(req);
  if (r.source === id) r.source = null;
  if (r.target === id) r.target = null;
}

// Assign an existing connection to the first free role (source, then target).
export function autoAssignRole(req, id) {
  const r = roles(req);
  if (!r.source) r.source = id;
  else if (!r.target) r.target = id;
}

export function setRoles(req, { source, target } = {}) {
  const s = store(req);
  const r = roles(req);
  if (source !== undefined) r.source = source && s[source] ? source : null;
  if (target !== undefined) r.target = target && s[target] ? target : null;
}

export function swapRoles(req) {
  const r = roles(req);
  [r.source, r.target] = [r.target, r.source];
}

export function connectionSummary(id, creds) {
  return {
    id,
    label: creds.label || creds.userInfo?.username || creds.instanceUrl,
    instanceUrl: creds.instanceUrl,
    username: creds.userInfo?.username,
    organizationId: creds.userInfo?.organizationId,
    loginUrl: creds.loginUrl,
    method: creds.method,
  };
}

export function listConnections(req) {
  return Object.entries(store(req)).map(([id, creds]) => connectionSummary(id, creds));
}

// Raw id→credentials map (includes secrets) — for encrypted export only.
export function rawConnections(req) {
  return store(req);
}

// True if a credentials object matches one already stored (same org login).
export function findDuplicate(req, creds) {
  const s = store(req);
  return Object.values(s).some(
    (c) =>
      c.instanceUrl === creds.instanceUrl &&
      (c.userInfo?.username || null) === (creds.userInfo?.username || null) &&
      c.method === creds.method,
  );
}

export function rolesView(req) {
  const r = roles(req);
  return { source: r.source || null, target: r.target || null };
}

/**
 * Build a live jsforce Connection for a side (via its role pointer), attaching
 * a token-refresh listener that updates the stored connection credentials.
 */
export function requireConnection(req, side) {
  if (!isValidSide(side)) {
    const err = new Error(`Unknown side "${side}". Expected "source" or "target".`);
    err.status = 400;
    throw err;
  }
  const id = roles(req)[side];
  if (!id) {
    const err = new Error(`No ${side} connection selected.`);
    err.status = 401;
    throw err;
  }
  const creds = store(req)[id];
  if (!creds) {
    const err = new Error(`The selected ${side} connection is no longer available.`);
    err.status = 401;
    throw err;
  }
  const conn = connectionFromCredentials(creds);
  conn.on('refresh', (accessToken) => {
    if (accessToken) {
      creds.accessToken = accessToken;
      req.__sessionRefreshed = true;
    }
  });
  return conn;
}

export async function maybeSaveRefreshed(req) {
  if (req.__sessionRefreshed) {
    req.__sessionRefreshed = false;
    await req.session.save();
  }
}

/**
 * A compact, safe view of the connection currently assigned to a side.
 */
export function statusView(req, side) {
  const id = roles(req)[side];
  if (!id) return { connected: false };
  const creds = store(req)[id];
  if (!creds) return { connected: false };
  return {
    connected: true,
    id,
    instanceUrl: creds.instanceUrl,
    loginUrl: creds.loginUrl,
    userInfo: creds.userInfo,
  };
}
