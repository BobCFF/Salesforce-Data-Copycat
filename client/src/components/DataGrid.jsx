import React, { useMemo, useState } from 'react';

// A sortable, per-column filterable data grid for query results.
// Sorting and filtering here are client-side over the fetched result set;
// server-side SOQL WHERE / ORDER BY is handled separately by the query builder.
export default function DataGrid({ columns, records }) {
  const [sort, setSort] = useState({ field: null, dir: 'asc' });
  const [filters, setFilters] = useState({});

  function toggleSort(field) {
    setSort((s) => {
      if (s.field !== field) return { field, dir: 'asc' };
      if (s.dir === 'asc') return { field, dir: 'desc' };
      return { field: null, dir: 'asc' };
    });
  }

  const rows = useMemo(() => {
    let out = (records || []).map((r) => flatten(r));
    // Column filters (case-insensitive substring).
    for (const [field, value] of Object.entries(filters)) {
      const q = value.trim().toLowerCase();
      if (!q) continue;
      out = out.filter((r) => String(r[field] ?? '').toLowerCase().includes(q));
    }
    // Sort.
    if (sort.field) {
      const dir = sort.dir === 'desc' ? -1 : 1;
      out = [...out].sort((a, b) => compare(a[sort.field], b[sort.field]) * dir);
    }
    return out;
  }, [records, filters, sort]);

  if (!columns?.length) {
    return <div className="grid-empty">Select fields and run a query to see data.</div>;
  }

  return (
    <div className="grid-wrap">
      <div className="grid-meta">
        {rows.length} row{rows.length === 1 ? '' : 's'}
        {records && rows.length !== records.length ? ` (of ${records.length})` : ''}
      </div>
      <div className="grid-scroll">
        <table className="data-grid">
          <thead>
            <tr>
              {columns.map((c) => (
                <th key={c} onClick={() => toggleSort(c)} title="Click to sort">
                  <span className="th-label">{c}</span>
                  <span className="sort-caret">
                    {sort.field === c ? (sort.dir === 'asc' ? ' ▲' : ' ▼') : ''}
                  </span>
                </th>
              ))}
            </tr>
            <tr className="filter-row">
              {columns.map((c) => (
                <th key={c}>
                  <input
                    type="text"
                    value={filters[c] || ''}
                    placeholder="filter"
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => setFilters((f) => ({ ...f, [c]: e.target.value }))}
                  />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.Id || i}>
                {columns.map((c) => (
                  <td key={c} title={fmt(r[c])}>
                    {fmt(r[c])}
                  </td>
                ))}
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td className="grid-empty" colSpan={columns.length}>
                  No rows match the current filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Flatten one level of relationship objects (e.g. Account.Name) for display.
function flatten(record) {
  const out = {};
  for (const [k, v] of Object.entries(record)) {
    if (k === 'attributes') continue;
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
      for (const [k2, v2] of Object.entries(v)) {
        if (k2 === 'attributes') continue;
        out[`${k}.${k2}`] = v2;
      }
    } else {
      out[k] = v;
    }
  }
  return out;
}

function fmt(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

function compare(a, b) {
  if (a === null || a === undefined) return -1;
  if (b === null || b === undefined) return 1;
  const na = Number(a);
  const nb = Number(b);
  if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
  return String(a).localeCompare(String(b));
}
