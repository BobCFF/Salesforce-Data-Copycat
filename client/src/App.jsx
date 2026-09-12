import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from './api.js';
import ConnectionPanel from './components/ConnectionPanel.jsx';
import ObjectTree from './components/ObjectTree.jsx';
import QueryBuilder from './components/QueryBuilder.jsx';
import DataGrid from './components/DataGrid.jsx';
import CopyPanel from './components/CopyPanel.jsx';

const DEFAULT_SELECTION = {
  sobject: '',
  fields: ['Id'],
  filters: [],
  filterLogic: 'AND',
  orderBy: [],
  limit: 200,
  useBulk: false,
};

export default function App() {
  const [status, setStatus] = useState(null);
  const [sourceObjects, setSourceObjects] = useState([]);
  const [targetObjects, setTargetObjects] = useState([]);
  const [loadingObjects, setLoadingObjects] = useState(false);

  const [selectedObject, setSelectedObject] = useState('');
  const [meta, setMeta] = useState(null);
  const [loadingMeta, setLoadingMeta] = useState(false);
  const [selection, setSelection] = useState(DEFAULT_SELECTION);

  const [queryResult, setQueryResult] = useState(null);
  const [querying, setQuerying] = useState(false);

  const [targetMeta, setTargetMeta] = useState(null);
  const [copyResult, setCopyResult] = useState(null);
  const [copying, setCopying] = useState(false);

  const [error, setError] = useState('');

  const sourceConnected = status?.source?.connected;
  const targetConnected = status?.target?.connected;

  const refreshStatus = useCallback(async () => {
    try {
      const s = await api.status();
      setStatus(s);
      return s;
    } catch (err) {
      setError(err.message);
      return null;
    }
  }, []);

  useEffect(() => {
    refreshStatus();
  }, [refreshStatus]);

  // Load object lists when a side connects.
  useEffect(() => {
    if (sourceConnected) loadObjects('source');
    else setSourceObjects([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceConnected]);

  useEffect(() => {
    if (targetConnected) loadObjects('target');
    else setTargetObjects([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetConnected]);

  async function loadObjects(side) {
    setLoadingObjects(true);
    try {
      const { objects } = await api.objects(side);
      if (side === 'source') setSourceObjects(objects);
      else setTargetObjects(objects);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoadingObjects(false);
    }
  }

  async function selectObject(name) {
    setSelectedObject(name);
    setMeta(null);
    setQueryResult(null);
    setCopyResult(null);
    setLoadingMeta(true);
    try {
      const m = await api.describe('source', name);
      setMeta(m);
      // Default field selection: Id + Name (if present) + a few common ones.
      const names = m.fields.map((f) => f.name);
      const defaults = ['Id', 'Name'].filter((f) => names.includes(f));
      setSelection({
        ...DEFAULT_SELECTION,
        sobject: name,
        fields: defaults.length ? defaults : ['Id'],
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoadingMeta(false);
    }
  }

  async function runQuery() {
    if (!selectedObject) return;
    setQuerying(true);
    setError('');
    try {
      const res = await api.query('source', {
        sobject: selectedObject,
        fields: selection.fields,
        filters: selection.filters,
        filterLogic: selection.filterLogic,
        orderBy: selection.orderBy,
        limit: selection.limit,
        useBulk: selection.useBulk,
        maxRecords: Number(selection.limit) || 2000,
      });
      setQueryResult(res);
    } catch (err) {
      setError(err.message);
      setQueryResult(null);
    } finally {
      setQuerying(false);
    }
  }

  async function loadTargetMeta(name) {
    try {
      const m = await api.describe('target', name);
      setTargetMeta(m);
    } catch (err) {
      setError(err.message);
    }
  }

  async function doCopy({ sourceObject, targetObject, operation, externalIdField, useBulk }) {
    setCopying(true);
    setCopyResult(null);
    setError('');
    try {
      const res = await api.copy({
        sourceObject,
        targetObject,
        fields: selection.fields,
        filters: selection.filters,
        filterLogic: selection.filterLogic,
        whereRaw: selection.whereRaw || '',
        orderBy: selection.orderBy,
        limit: selection.limit,
        operation,
        externalIdField,
        useBulk,
      });
      setCopyResult(res);
    } catch (err) {
      setError(err.message);
    } finally {
      setCopying(false);
    }
  }

  async function logout() {
    await api.logout();
    setStatus(null);
    setSourceObjects([]);
    setTargetObjects([]);
    setSelectedObject('');
    setMeta(null);
    setQueryResult(null);
    await refreshStatus();
  }

  const soqlPreview = useMemo(() => buildPreview(selection), [selection]);
  const columns = queryResult?.records?.length ? deriveColumns(queryResult.records, selection.fields) : selection.fields;

  return (
    <div className="app">
      <header className="titlebar">
        <div className="title">
          <span className="app-icon">🗂️</span> Salesforce Data Copycat
        </div>
        <div className="titlebar-actions">
          {(sourceConnected || targetConnected) && (
            <button className="btn small" onClick={logout}>Log out all</button>
          )}
        </div>
      </header>

      <div className="connbar">
        <ConnectionPanel
          side="source"
          status={status?.source}
          oauthEnabled={status?.oauthEnabled}
          onChange={refreshStatus}
        />
        <div className="copy-arrow">➜</div>
        <ConnectionPanel
          side="target"
          status={status?.target}
          oauthEnabled={status?.oauthEnabled}
          onChange={refreshStatus}
        />
      </div>

      {error && (
        <div className="error-bar">
          {error}
          <button className="link" onClick={() => setError('')}>dismiss</button>
        </div>
      )}

      <div className="explorer">
        <aside className="col tree-col">
          <ObjectTree
            title="Source Objects"
            objects={sourceObjects}
            loading={loadingObjects && !sourceObjects.length}
            selected={selectedObject}
            onSelect={selectObject}
          />
        </aside>

        <section className="col qb-col">
          <div className="pane-header">
            Query: {selectedObject || '—'}
          </div>
          <QueryBuilder
            meta={meta}
            loading={loadingMeta}
            value={selection}
            onChange={setSelection}
            soqlPreview={soqlPreview}
          />
        </section>

        <main className="col grid-col">
          <div className="toolbar">
            <button className="btn primary" onClick={runQuery} disabled={!selectedObject || querying}>
              {querying ? 'Running…' : '▶ Run Query'}
            </button>
            {queryResult && (
              <span className="toolbar-info">
                {queryResult.totalSize} record{queryResult.totalSize === 1 ? '' : 's'}
                {queryResult.bulk ? ' • Bulk API' : ''}
              </span>
            )}
          </div>
          <DataGrid columns={columns} records={queryResult?.records || []} />
        </main>

        <aside className="col copy-col">
          <CopyPanel
            sourceObject={selectedObject}
            fields={selection.fields}
            targetConnected={targetConnected}
            targetObjects={targetObjects}
            targetMeta={targetMeta}
            onLoadTargetMeta={loadTargetMeta}
            onCopy={doCopy}
            copying={copying}
            result={copyResult}
          />
        </aside>
      </div>

      <footer className="statusbar">
        <span>{sourceConnected ? `Source: ${status.source.userInfo?.username || status.source.instanceUrl}` : 'Source: not connected'}</span>
        <span>{targetConnected ? `Target: ${status.target.userInfo?.username || status.target.instanceUrl}` : 'Target: not connected'}</span>
        <span className="spacer" />
        <span>{selectedObject ? `${selection.fields.length} fields selected` : 'No object selected'}</span>
      </footer>
    </div>
  );
}

// Lightweight client-side SOQL preview (server is the source of truth on run).
function buildPreview(sel) {
  if (!sel.sobject) return '';
  const fields = sel.fields.length ? sel.fields.join(', ') : 'Id';
  let soql = `SELECT ${fields} FROM ${sel.sobject}`;
  const clauses = sel.filters
    .filter((f) => f.field)
    .map((f) => `${f.field} ${f.op} ${previewValue(f.value, f.op)}`);
  if (clauses.length) {
    soql += ` WHERE ${clauses.join(sel.filterLogic === 'OR' ? ' OR ' : ' AND ')}`;
  }
  const order = sel.orderBy.filter((o) => o.field).map((o) => `${o.field} ${o.dir}`);
  if (order.length) soql += ` ORDER BY ${order.join(', ')}`;
  if (sel.limit) soql += ` LIMIT ${sel.limit}`;
  return soql;
}

function previewValue(value, op) {
  if (op === 'IN' || op === 'NOT IN') {
    const items = String(value).split(',').map((v) => v.trim()).filter(Boolean);
    return `(${items.map(previewScalar).join(', ')})`;
  }
  return previewScalar(value);
}

function previewScalar(s) {
  const v = String(s ?? '').trim();
  if (v === '') return "''";
  if (/^(true|false)$/i.test(v)) return v.toLowerCase();
  if (/^-?\d+(\.\d+)?$/.test(v)) return v;
  if (/^\d{4}-\d{2}-\d{2}/.test(v)) return v;
  return `'${v.replace(/'/g, "\\'")}'`;
}

function deriveColumns(records, selectedFields) {
  const cols = new Set(selectedFields.filter((f) => f !== 'attributes'));
  for (const r of records.slice(0, 20)) {
    for (const [k, v] of Object.entries(r)) {
      if (k === 'attributes') continue;
      if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
        for (const k2 of Object.keys(v)) {
          if (k2 !== 'attributes') cols.add(`${k}.${k2}`);
        }
      } else {
        cols.add(k);
      }
    }
  }
  return [...cols];
}
