import jsforce from 'jsforce';
import config from './config.js';

/**
 * Credentials we keep in the server-side session for a single org connection.
 * Only what jsforce needs to rebuild a Connection — never the raw password or
 * security token.
 *
 * @typedef {Object} StoredCredentials
 * @property {string} instanceUrl
 * @property {string} accessToken
 * @property {string} [refreshToken]
 * @property {string} loginUrl
 * @property {Object} userInfo
 */

/**
 * Build a live jsforce Connection from stored credentials.
 * @param {StoredCredentials} creds
 */
export function connectionFromCredentials(creds) {
  // OAuth config for token refresh: prefer the config stored with the
  // connection (session-configured Connected App), else fall back to env vars.
  const oauthApp = creds.oauth || (config.oauthEnabled ? config.oauth : null);
  return new jsforce.Connection({
    instanceUrl: creds.instanceUrl,
    accessToken: creds.accessToken,
    refreshToken: creds.refreshToken,
    loginUrl: creds.loginUrl,
    version: config.apiVersion,
    oauth2: oauthApp
      ? {
          clientId: oauthApp.clientId,
          clientSecret: oauthApp.clientSecret,
          redirectUri: oauthApp.redirectUri,
        }
      : undefined,
  });
}

/**
 * Authenticate with username + password (+ security token appended).
 * Returns StoredCredentials.
 */
export async function loginWithPassword({ loginUrl, username, password, securityToken }) {
  const conn = new jsforce.Connection({
    loginUrl: loginUrl || 'https://login.salesforce.com',
    version: config.apiVersion,
  });
  const secret = `${password}${securityToken || ''}`;
  const userInfo = await conn.login(username, secret);
  return {
    instanceUrl: conn.instanceUrl,
    accessToken: conn.accessToken,
    loginUrl: loginUrl || 'https://login.salesforce.com',
    userInfo: await identity(conn, userInfo),
  };
}

/**
 * Authenticate with an already-obtained access token + instance URL.
 * Useful for "sfdx force:org:display" or session-id based access.
 */
export async function loginWithToken({ instanceUrl, accessToken }) {
  const conn = new jsforce.Connection({
    instanceUrl,
    accessToken,
    version: config.apiVersion,
  });
  // Validate the token and grab identity in one call.
  const ident = await conn.identity();
  return {
    instanceUrl: conn.instanceUrl,
    accessToken,
    loginUrl: instanceUrl,
    userInfo: {
      id: ident.user_id,
      organizationId: ident.organization_id,
      username: ident.username,
      displayName: ident.display_name,
      url: ident.urls?.custom_domain || conn.instanceUrl,
    },
  };
}

async function identity(conn, loginResult) {
  try {
    const ident = await conn.identity();
    return {
      id: ident.user_id,
      organizationId: ident.organization_id,
      username: ident.username,
      displayName: ident.display_name,
      url: conn.instanceUrl,
    };
  } catch {
    return {
      id: loginResult.id,
      organizationId: loginResult.organizationId,
      username: undefined,
      displayName: undefined,
      url: conn.instanceUrl,
    };
  }
}

/**
 * List all sobjects for the tree view. Returns a compact projection.
 */
export async function describeGlobal(conn) {
  const res = await conn.describeGlobal();
  return res.sobjects.map((s) => ({
    name: s.name,
    label: s.label,
    labelPlural: s.labelPlural,
    custom: s.custom,
    queryable: s.queryable,
    createable: s.createable,
    updateable: s.updateable,
    keyPrefix: s.keyPrefix,
  }));
}

/**
 * Describe a single sobject's fields for the field picker / mapping UI.
 */
export async function describeSObject(conn, sobject) {
  const meta = await conn.sobject(sobject).describe();
  return {
    name: meta.name,
    label: meta.label,
    createable: meta.createable,
    updateable: meta.updateable,
    fields: meta.fields.map((f) => ({
      name: f.name,
      label: f.label,
      type: f.type,
      length: f.length,
      precision: f.precision,
      scale: f.scale,
      createable: f.createable,
      updateable: f.updateable,
      nillable: f.nillable,
      defaultedOnCreate: f.defaultedOnCreate,
      unique: f.unique,
      externalId: f.externalId,
      idLookup: f.idLookup,
      referenceTo: f.referenceTo,
      relationshipName: f.relationshipName,
      picklistValues: (f.picklistValues || []).map((p) => ({ value: p.value, label: p.label, active: p.active })),
    })),
  };
}

const COMPARISON_OPS = new Set(['=', '!=', '<', '<=', '>', '>=', 'LIKE', 'IN', 'NOT IN']);

/**
 * Escape a value for safe inclusion inside a SOQL string literal.
 * Salesforce SOQL uses backslash escaping for quotes and backslashes.
 */
function escapeSoqlString(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function formatSoqlValue(value, op) {
  if (op === 'IN' || op === 'NOT IN') {
    const items = Array.isArray(value)
      ? value
      : String(value)
          .split(',')
          .map((v) => v.trim())
          .filter((v) => v.length);
    return `(${items.map((v) => formatScalar(v)).join(', ')})`;
  }
  return formatScalar(value);
}

function formatScalar(value) {
  if (value === null || value === '' || value === undefined) return 'null';
  const s = String(value).trim();
  // Booleans, numbers, dates, datetimes and SOQL date literals are unquoted.
  if (/^(true|false)$/i.test(s)) return s.toLowerCase();
  if (/^-?\d+(\.\d+)?$/.test(s)) return s;
  if (/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})?)?$/.test(s)) return s;
  if (/^(TODAY|YESTERDAY|TOMORROW|THIS_WEEK|LAST_WEEK|THIS_MONTH|LAST_MONTH|THIS_YEAR|LAST_YEAR|LAST_N_DAYS:\d+|NEXT_N_DAYS:\d+)$/i.test(s)) {
    return s.toUpperCase();
  }
  return `'${escapeSoqlString(s)}'`;
}

/**
 * Build a SOQL statement from structured selection input.
 *
 * @param {Object} opts
 * @param {string} opts.sobject
 * @param {string[]} opts.fields
 * @param {Array<{field:string,op:string,value:any}>} [opts.filters]
 * @param {string} [opts.filterLogic] - "AND" | "OR" (default AND)
 * @param {string} [opts.whereRaw] - raw WHERE clause, appended (ANDed) if provided
 * @param {Array<{field:string,dir:string}>} [opts.orderBy]
 * @param {number} [opts.limit]
 */
export function buildSoql(opts) {
  const {
    sobject,
    fields,
    filters = [],
    filterLogic = 'AND',
    whereRaw = '',
    orderBy = [],
    limit,
  } = opts;

  if (!sobject || !/^[A-Za-z0-9_]+$/.test(sobject)) {
    throw new Error('Invalid sobject name.');
  }
  const selected = (fields && fields.length ? fields : ['Id']).filter((f) => /^[A-Za-z0-9_.]+$/.test(f));
  if (!selected.length) throw new Error('No valid fields selected.');

  const clauses = [];
  for (const f of filters) {
    if (!f || !f.field) continue;
    if (!/^[A-Za-z0-9_.]+$/.test(f.field)) throw new Error(`Invalid filter field: ${f.field}`);
    const op = (f.op || '=').toUpperCase();
    if (!COMPARISON_OPS.has(op)) throw new Error(`Unsupported operator: ${f.op}`);
    clauses.push(`${f.field} ${op} ${formatSoqlValue(f.value, op)}`);
  }

  let where = '';
  const logic = filterLogic.toUpperCase() === 'OR' ? ' OR ' : ' AND ';
  if (clauses.length) where = clauses.join(logic);
  if (whereRaw && whereRaw.trim()) {
    where = where ? `(${where}) AND (${whereRaw.trim()})` : whereRaw.trim();
  }

  const order = orderBy
    .filter((o) => o && o.field && /^[A-Za-z0-9_.]+$/.test(o.field))
    .map((o) => `${o.field} ${String(o.dir).toUpperCase() === 'DESC' ? 'DESC' : 'ASC'}`);

  let soql = `SELECT ${selected.join(', ')} FROM ${sobject}`;
  if (where) soql += ` WHERE ${where}`;
  if (order.length) soql += ` ORDER BY ${order.join(', ')}`;
  if (limit && Number.isFinite(Number(limit))) soql += ` LIMIT ${Math.max(1, Math.floor(Number(limit)))}`;
  return soql;
}

/**
 * Run a query. For small result sets uses the REST query API with autoFetch;
 * for large sets (useBulk) uses the Bulk API query which streams all rows.
 */
export async function runQuery(conn, soql, { useBulk = false, maxRecords = 50000 } = {}) {
  if (useBulk) {
    // bulk2.query resolves to a record stream (Parsable); collect it to an array.
    const stream = await conn.bulk2.query(soql);
    const records = await new Promise((resolve, reject) => {
      const recs = [];
      stream.on('record', (r) => recs.push(r));
      stream.on('error', reject);
      stream.on('end', () => resolve(recs));
    });
    return { records, totalSize: records.length, done: true, bulk: true };
  }
  const result = await conn.query(soql, { autoFetch: true, maxFetch: maxRecords });
  return {
    records: result.records || [],
    totalSize: result.totalSize,
    done: result.done,
    bulk: false,
  };
}

/**
 * Validate a SOQL statement against the org WITHOUT fetching rows, using the
 * Query "explain" plan endpoint. Salesforce parses and semantically checks the
 * query (object + field names, syntax) and returns a query plan on success, or
 * a 4xx with a descriptive message on failure.
 *
 * @returns {Promise<{valid:boolean, error?:string, cost?:number, plans?:number}>}
 */
export async function validateSoql(conn, soql) {
  const trimmed = String(soql || '').trim();
  if (!trimmed) return { valid: false, error: 'The query is empty.' };
  const url = `/services/data/v${config.apiVersion}/query/?explain=${encodeURIComponent(trimmed)}`;
  try {
    const res = await conn.request(url);
    const plans = Array.isArray(res?.plans) ? res.plans : [];
    return {
      valid: true,
      plans: plans.length,
      cost: plans.length ? plans[0].relativeCost : undefined,
    };
  } catch (err) {
    // jsforce surfaces Salesforce's error array; take the first message.
    const message = Array.isArray(err) ? err[0]?.message : err?.message;
    return { valid: false, error: message || 'Invalid SOQL.' };
  }
}

/**
 * Strip Salesforce system/read-only attributes from records and keep only the
 * fields that are createable/updateable on the target, plus optional field
 * name remapping (sourceField -> targetField).
 *
 * @param {Object[]} records
 * @param {Set<string>} allowedFields - lower-cased target field names to keep
 * @param {Record<string,string>} [mapping] - source field -> target field
 */
export function prepareRecords(records, allowedFields, mapping = {}) {
  const lowerAllowed = new Set([...allowedFields].map((f) => f.toLowerCase()));
  return records.map((rec) => {
    const out = {};
    for (const [key, value] of Object.entries(rec)) {
      if (key === 'attributes') continue;
      const targetKey = mapping[key] || key;
      if (!lowerAllowed.has(targetKey.toLowerCase())) continue;
      // Flatten nested relationship objects to null (can't insert nested).
      if (value !== null && typeof value === 'object') continue;
      out[targetKey] = value;
    }
    return out;
  });
}

/**
 * Load records into the target org using the Bulk API v2 (default) or the
 * REST collection API for small batches.
 *
 * @param {jsforce.Connection} conn
 * @param {string} sobject
 * @param {Object[]} records
 * @param {Object} opts
 * @param {'insert'|'update'|'upsert'} opts.operation
 * @param {string} [opts.externalIdField] - required for upsert
 * @param {boolean} [opts.useBulk]
 * @param {(progress:Object)=>void} [opts.onProgress]
 */
export async function loadRecords(conn, sobject, records, opts) {
  const { operation = 'insert', externalIdField, useBulk = true, onProgress } = opts;
  if (!records.length) {
    return { total: 0, successCount: 0, failureCount: 0, results: [] };
  }
  if (operation === 'upsert' && !externalIdField) {
    throw new Error('An external ID field is required for upsert.');
  }

  let rawResults;
  if (useBulk) {
    rawResults = await conn.bulk2.loadAndWaitForResults({
      object: sobject,
      operation,
      externalIdFieldName: operation === 'upsert' ? externalIdField : undefined,
      input: records,
      pollInterval: 2000,
      pollTimeout: 1000 * 60 * 10,
    }).then((r) => normalizeBulk2Results(r, records));
  } else {
    const api = conn.sobject(sobject);
    let promise;
    if (operation === 'insert') promise = api.create(records, { allOrNone: false });
    else if (operation === 'update') promise = api.update(records, { allOrNone: false });
    else promise = api.upsert(records, externalIdField, { allOrNone: false });
    const res = await promise;
    rawResults = (Array.isArray(res) ? res : [res]).map((r, i) => ({
      row: i,
      success: r.success,
      id: r.id,
      errors: r.success ? [] : (r.errors || []).map(errText),
    }));
  }

  const successCount = rawResults.filter((r) => r.success).length;
  if (onProgress) onProgress({ processed: rawResults.length, total: records.length });
  return {
    total: records.length,
    successCount,
    failureCount: rawResults.length - successCount,
    results: rawResults,
  };
}

function normalizeBulk2Results(bulkResult, records) {
  // jsforce v3 bulk2 loadAndWaitForResults returns { successfulResults, failedResults, unprocessedRecords }
  const out = [];
  const successful = bulkResult.successfulResults || [];
  const failed = bulkResult.failedResults || [];
  for (const s of successful) {
    out.push({ success: true, id: s.sf__Id || s.Id, errors: [] });
  }
  for (const f of failed) {
    out.push({ success: false, id: f.sf__Id || null, errors: [f.sf__Error || 'Unknown error'] });
  }
  const unprocessed = bulkResult.unprocessedRecords;
  if (Array.isArray(unprocessed)) {
    for (const u of unprocessed) {
      out.push({ success: false, id: null, errors: [u.sf__Error || 'Unprocessed'] });
    }
  }
  return out;
}

function errText(e) {
  if (typeof e === 'string') return e;
  if (e && e.message) return `${e.statusCode || 'ERROR'}: ${e.message}`;
  return JSON.stringify(e);
}
