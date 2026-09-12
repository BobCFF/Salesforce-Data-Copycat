import React, { useEffect, useMemo, useState } from 'react';
import { usePersistedState } from '../usePersistedState.js';

const DEFAULT_COL_WIDTH = 160;
const MIN_COL_WIDTH = 60;

// A sortable, per-column filterable data grid for query results, with
// resizable and reorderable columns and a per-column ⋯ menu (sort / remove).
// Sorting and filtering here are client-side over the fetched result set;
// server-side SOQL WHERE / ORDER BY is handled separately by the query builder.
export default function DataGrid({ columns, records }) {
  const [sort, setSort] = useState({ field: null, dir: 'asc' });
  const [filters, setFilters] = useState({});
  const [order, setOrder] = useState(columns);
  const [hidden, setHidden] = useState([]);
  // Column widths are keyed by column name and persist across queries/refreshes.
  const [widths, setWidths] = usePersistedState('sfcopycat.colWidths', {});
  const [menuCol, setMenuCol] = useState(null);
  const [dragCol, setDragCol] = useState(null);

  // Re-sync internal column state when a new query changes the column set.
  const columnsKey = columns.join('|');
  useEffect(() => {
    setOrder(columns);
    setHidden([]);
    setMenuCol(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [columnsKey]);

  const visible = useMemo(
    () => order.filter((c) => columns.includes(c) && !hidden.includes(c)),
    [order, columns, hidden]
  );

  function toggleSort(field) {
    setSort((s) => {
      if (s.field !== field) return { field, dir: 'asc' };
      if (s.dir === 'asc') return { field, dir: 'desc' };
      return { field: null, dir: 'asc' };
    });
  }

  function removeColumn(col) {
    setHidden((h) => [...h, col]);
    setMenuCol(null);
  }
  function restoreColumns() {
    setHidden([]);
  }

  // --- column resize ---
  function startResize(e, col) {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startW = widths[col] || DEFAULT_COL_WIDTH;
    function move(ev) {
      const w = Math.max(MIN_COL_WIDTH, startW + (ev.clientX - startX));
      setWidths((prev) => ({ ...prev, [col]: w }));
    }
    function up() {
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', up);
    }
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
  }

  // --- column reorder (drag & drop) ---
  function onDrop(targetCol) {
    setOrder((prev) => {
      if (!dragCol || dragCol === targetCol) return prev;
      const arr = [...prev];
      const from = arr.indexOf(dragCol);
      const to = arr.indexOf(targetCol);
      if (from === -1 || to === -1) return prev;
      arr.splice(from, 1);
      arr.splice(to, 0, dragCol);
      return arr;
    });
    setDragCol(null);
  }

  const rows = useMemo(() => {
    let out = (records || []).map((r) => flatten(r));
    for (const [field, value] of Object.entries(filters)) {
      const q = value.trim().toLowerCase();
      if (!q) continue;
      out = out.filter((r) => String(r[field] ?? '').toLowerCase().includes(q));
    }
    if (sort.field) {
      const dir = sort.dir === 'desc' ? -1 : 1;
      out = [...out].sort((a, b) => compare(a[sort.field], b[sort.field]) * dir);
    }
    return out;
  }, [records, filters, sort]);

  if (!columns?.length) {
    return <div className="grid-empty">Select fields and run a query to see data.</div>;
  }

  const totalWidth = visible.reduce((sum, c) => sum + (widths[c] || DEFAULT_COL_WIDTH), 0);

  return (
    <div className="grid-wrap">
      <div className="grid-meta">
        {rows.length} row{rows.length === 1 ? '' : 's'}
        {records && rows.length !== records.length ? ` (of ${records.length})` : ''}
        {hidden.length > 0 && (
          <button className="link restore-cols" onClick={restoreColumns}>
            + {hidden.length} hidden column{hidden.length === 1 ? '' : 's'} — restore
          </button>
        )}
      </div>
      <div className="grid-scroll">
        <table className="data-grid resizable" style={{ width: totalWidth, tableLayout: 'fixed' }}>
          <colgroup>
            {visible.map((c) => (
              <col key={c} style={{ width: widths[c] || DEFAULT_COL_WIDTH }} />
            ))}
          </colgroup>
          <thead>
            <tr>
              {visible.map((c) => (
                <th
                  key={c}
                  className={dragCol === c ? 'dragging' : ''}
                  style={menuCol === c ? { zIndex: 30 } : undefined}
                >
                  <div className="th-inner">
                    <span
                      className="th-grip"
                      draggable
                      onDragStart={() => setDragCol(c)}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={() => onDrop(c)}
                      onDragEnd={() => setDragCol(null)}
                      onClick={() => toggleSort(c)}
                      title="Click to sort · drag to reorder"
                    >
                      <span className="th-label">{c}</span>
                      <span className="sort-caret">
                        {sort.field === c ? (sort.dir === 'asc' ? ' ▲' : ' ▼') : ''}
                      </span>
                    </span>
                    <button
                      type="button"
                      className="th-menu-btn"
                      title="Column options"
                      onClick={(e) => {
                        e.stopPropagation();
                        setMenuCol((m) => (m === c ? null : c));
                      }}
                    >
                      ⋯
                    </button>
                  </div>
                  <span
                    className="col-resizer"
                    onMouseDown={(e) => startResize(e, c)}
                    onClick={(e) => e.stopPropagation()}
                  />
                  {menuCol === c && (
                    <div className="col-menu" onClick={(e) => e.stopPropagation()}>
                      <button onClick={() => { setSort({ field: c, dir: 'asc' }); setMenuCol(null); }}>
                        Sort ascending
                      </button>
                      <button onClick={() => { setSort({ field: c, dir: 'desc' }); setMenuCol(null); }}>
                        Sort descending
                      </button>
                      <div className="col-menu-sep" />
                      <button className="danger" onClick={() => removeColumn(c)}>
                        Remove column
                      </button>
                    </div>
                  )}
                </th>
              ))}
            </tr>
            <tr className="filter-row">
              {visible.map((c) => (
                <th key={c}>
                  <input
                    type="text"
                    value={filters[c] || ''}
                    placeholder="filter"
                    onChange={(e) => setFilters((f) => ({ ...f, [c]: e.target.value }))}
                  />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.Id || i}>
                {visible.map((c) => (
                  <td key={c} title={fmt(r[c])}>
                    {fmt(r[c])}
                  </td>
                ))}
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td className="grid-empty" colSpan={visible.length}>
                  No rows match the current filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {menuCol && <div className="col-menu-backdrop" onClick={() => setMenuCol(null)} />}
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
