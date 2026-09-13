// Thin wrapper around fetch that always sends the session cookie and throws
// a useful Error on non-2xx responses.

async function request(method, url, body) {
  const res = await fetch(url, {
    method,
    credentials: 'include',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { error: text };
  }
  if (!res.ok) {
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  return data;
}

export const api = {
  status: () => request('GET', '/api/status'),

  // Named connection registry.
  connections: () => request('GET', '/api/connections'),
  createConnection: (payload) => request('POST', '/api/connect', payload),
  setRoles: ({ source, target }) => request('POST', '/api/connections/roles', { source, target }),
  removeConnection: (id) => request('DELETE', `/api/connections/${id}`),
  exportConnections: ({ passphrase, ids } = {}) => request('POST', '/api/connections/export', { passphrase, ids }),
  importConnections: ({ passphrase, envelope }) => request('POST', '/api/connections/import', { passphrase, envelope }),
  logout: () => request('POST', '/api/disconnect'),
  swapConnections: () => request('POST', '/api/connections/swap'),

  getOAuthConfig: () => request('GET', '/api/oauth/config'),
  setOAuthConfig: (payload) => request('POST', '/api/oauth/config', payload),
  clearOAuthConfig: () => request('POST', '/api/oauth/config/clear'),

  objects: (side) => request('GET', `/api/${side}/objects`),
  describe: (side, name) => request('GET', `/api/${side}/objects/${name}/describe`),
  query: (side, selection) => request('POST', `/api/${side}/query`, selection),
  buildSoql: (side, selection) => request('POST', `/api/${side}/soql`, selection),
  copy: (payload) => request('POST', '/api/copy', payload),
};
