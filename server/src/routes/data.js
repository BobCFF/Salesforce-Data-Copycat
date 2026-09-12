import express from 'express';
import {
  describeGlobal,
  describeSObject,
  buildSoql,
  runQuery,
  prepareRecords,
  loadRecords,
} from '../salesforce.js';
import { requireConnection, isValidSide } from '../connections.js';

const router = express.Router();

function asyncRoute(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

// List all objects for the tree view on a given side.
router.get(
  '/:side/objects',
  asyncRoute(async (req, res) => {
    const conn = requireConnection(req, req.params.side);
    const objects = await describeGlobal(conn);
    res.json({ objects });
  })
);

// Describe one object's fields.
router.get(
  '/:side/objects/:name/describe',
  asyncRoute(async (req, res) => {
    const { side, name } = req.params;
    if (!/^[A-Za-z0-9_]+$/.test(name)) return res.status(400).json({ error: 'Invalid object name.' });
    const conn = requireConnection(req, side);
    const meta = await describeSObject(conn, name);
    res.json(meta);
  })
);

// Preview / build SOQL without running it (handy for the UI).
router.post(
  '/:side/soql',
  asyncRoute(async (req, res) => {
    if (!isValidSide(req.params.side)) return res.status(400).json({ error: 'Invalid side.' });
    const soql = buildSoql(req.body || {});
    res.json({ soql });
  })
);

// Run a query built from the structured selection (filters, sort, limit).
router.post(
  '/:side/query',
  asyncRoute(async (req, res) => {
    const conn = requireConnection(req, req.params.side);
    const { useBulk = false, maxRecords = 2000, ...selection } = req.body || {};
    const soql = selection.soql && selection.soql.trim()
      ? selection.soql.trim()
      : buildSoql(selection);
    const result = await runQuery(conn, soql, { useBulk, maxRecords });
    res.json({ soql, ...result });
  })
);

// Copy data from source -> target.
router.post(
  '/copy',
  asyncRoute(async (req, res) => {
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

    if (!sourceObject) return res.status(400).json({ error: 'sourceObject is required.' });

    // 1. Read from source.
    const soql = rawSoql && rawSoql.trim()
      ? rawSoql.trim()
      : buildSoql({ sobject: sourceObject, fields, filters, filterLogic, whereRaw, orderBy, limit });
    const { records } = await runQuery(source, soql, { useBulk, maxRecords: 100000 });

    if (!records.length) {
      return res.json({ soql, total: 0, successCount: 0, failureCount: 0, results: [], targetObject });
    }

    // 2. Figure out which fields the target will accept for this operation.
    const targetMeta = await describeSObject(target, targetObject);
    const writable = new Set(
      targetMeta.fields
        .filter((f) => (operation === 'update' ? f.updateable : f.createable) || f.name === 'Id' || f.externalId)
        .map((f) => f.name)
    );
    // For update/upsert the Id or external id must be allowed through.
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

    res.json({ soql, targetObject, ...loadResult });
  })
);

export default router;
