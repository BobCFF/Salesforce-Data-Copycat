import express from 'express';
import {
  describeGlobal,
  describeSObject,
  buildSoql,
  runQuery,
  prepareRecords,
  loadRecords,
} from '../salesforce.js';
import { requireConnection, isValidSide, maybeSaveRefreshed } from '../connections.js';

const router = express.Router();

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

// Wrap a handler that returns the JSON payload. After it resolves we persist any
// OAuth token refresh that happened mid-request (before sending the response),
// then send the payload.
function route(fn) {
  return (req, res, next) =>
    Promise.resolve(fn(req, res))
      .then(async (data) => {
        await maybeSaveRefreshed(req);
        if (!res.headersSent && data !== undefined) res.json(data);
      })
      .catch(next);
}

// List all objects for the tree view on a given side.
router.get(
  '/:side/objects',
  route(async (req) => {
    const conn = requireConnection(req, req.params.side);
    const objects = await describeGlobal(conn);
    return { objects };
  })
);

// Describe one object's fields.
router.get(
  '/:side/objects/:name/describe',
  route(async (req) => {
    const { side, name } = req.params;
    if (!/^[A-Za-z0-9_]+$/.test(name)) throw httpError(400, 'Invalid object name.');
    const conn = requireConnection(req, side);
    return describeSObject(conn, name);
  })
);

// Preview / build SOQL without running it (handy for the UI).
router.post(
  '/:side/soql',
  route(async (req) => {
    if (!isValidSide(req.params.side)) throw httpError(400, 'Invalid side.');
    return { soql: buildSoql(req.body || {}) };
  })
);

// Run a query built from the structured selection (filters, sort, limit).
router.post(
  '/:side/query',
  route(async (req) => {
    const conn = requireConnection(req, req.params.side);
    const { useBulk = false, maxRecords = 2000, ...selection } = req.body || {};
    const soql = selection.soql && selection.soql.trim() ? selection.soql.trim() : buildSoql(selection);
    const result = await runQuery(conn, soql, { useBulk, maxRecords });
    return { soql, ...result };
  })
);

// Copy data from source -> target.
router.post(
  '/copy',
  route(async (req) => {
    const source = requireConnection(req, 'source');
    const target = requireConnection(req, 'target');

    const {
      sourceObject,
      targetObject = sourceObject,
      fields = [],
      filters = [],
      filterLogic = 'AND',
      whereRaw = '',
      orderBy = [],
      limit,
      operation = 'insert',
      externalIdField,
      fieldMapping = {},
      useBulk = true,
      soql: rawSoql,
    } = req.body || {};

    if (!sourceObject) throw httpError(400, 'sourceObject is required.');

    // 1. Read from source.
    const soql =
      rawSoql && rawSoql.trim()
        ? rawSoql.trim()
        : buildSoql({ sobject: sourceObject, fields, filters, filterLogic, whereRaw, orderBy, limit });
    const { records } = await runQuery(source, soql, { useBulk, maxRecords: 100000 });

    if (!records.length) {
      return { soql, total: 0, successCount: 0, failureCount: 0, results: [], targetObject };
    }

    // 2. Figure out which fields the target will accept for this operation.
    const targetMeta = await describeSObject(target, targetObject);
    const writable = new Set(
      targetMeta.fields
        .filter((f) => (operation === 'update' ? f.updateable : f.createable) || f.name === 'Id' || f.externalId)
        .map((f) => f.name)
    );
    if (operation === 'update') writable.add('Id');
    if (operation === 'upsert' && externalIdField) writable.add(externalIdField);

    // 3. Prepare records (strip system fields, apply mapping, keep writable only).
    const prepared = prepareRecords(records, writable, fieldMapping);

    // 4. Load into target.
    const loadResult = await loadRecords(target, targetObject, prepared, {
      operation,
      externalIdField,
      useBulk,
    });

    return { soql, targetObject, ...loadResult };
  })
);

export default router;
