import React, { useMemo, useState } from 'react';

// Modal that lets the user choose format and which columns to include, then
// downloads the current query results as CSV or JSON (client-side, no server).
export default function ExportDialog({ sobject, columns, records, onClose }) {
  const [format, setFormat] = useState('csv');
  const [includeHeader, setIncludeHeader] = useState(true);
  const [selected, setSelected] = useState(() => columns.slice());

  const flatRows = useMemo(() => (records || []).map((r) => flatten(r)), [records]);

  function toggle(col) {
    setSelected((s) => (s.includes(col) ? s.filter((c) => c !== col) : [...s, col]));
  }
  const orderedSelected = columns.filter((c) => selected.includes(c));

  function doExport() {
    if (!orderedSelected.length) return;
    const filename = `${sobject || 'export'}.${format}`;
    let content;
    let type;
    if (format === 'json') {
      const out = flatRows.map((r) => {
        const o = {};
        for (const c of orderedSelected) o[c] = r[c] ?? null;
        return o;
      });
      content = JSON.stringify(out, null, 2);
      type = 'application/json';
    } else {
      const lines = [];
      if (includeHeader) lines.push(orderedSelected.map(csvCell).join(','));
      for (const r of flatRows) lines.push(orderedSelected.map((c) => csvCell(r[c])).join(','));
      content = lines.join('\r\n');
      type = 'text/csv';
    }
    download(filename, content, type);
    onClose();
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          Export results
          <button className="modal-x" onClick={onClose} title="Close">✕</button>
        </div>
        <div className="modal-body">
          <div className="export-meta">
            {records?.length || 0} row{records?.length === 1 ? '' : 's'} · {orderedSelected.length}/{columns.length} columns
          </div>

          <div className="export-section">
            <div className="export-label">Format</div>
            <label className="inline"><input type="radio" checked={format === 'csv'} onChange={() => setFormat('csv')} /> CSV</label>
            <label className="inline"><input type="radio" checked={format === 'json'} onChange={() => setFormat('json')} /> JSON</label>
            {format === 'csv' && (
              <label className="inline">
                <input type="checkbox" checked={includeHeader} onChange={(e) => setIncludeHeader(e.target.checked)} /> Header row
              </label>
            )}
          </div>

          <div className="export-section">
            <div className="export-label">
              Columns
              <span className="export-actions">
                <button className="link" onClick={() => setSelected(columns.slice())}>All</button>
                <button className="link" onClick={() => setSelected([])}>None</button>
              </span>
            </div>
            <div className="export-cols">
              {columns.map((c) => (
                <label key={c} className="export-col">
                  <input type="checkbox" checked={selected.includes(c)} onChange={() => toggle(c)} />
                  <span>{c}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
        <div className="modal-foot">
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" onClick={doExport} disabled={!orderedSelected.length || !flatRows.length}>
            ⬇ Export {format.toUpperCase()}
          </button>
        </div>
      </div>
    </div>
  );
}

function flatten(record) {
  const out = {};
  for (const [k, v] of Object.entries(record)) {
    if (k === 'attributes') continue;
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
      for (const [k2, v2] of Object.entries(v)) {
        if (k2 !== 'attributes') out[`${k}.${k2}`] = v2;
      }
    } else {
      out[k] = v;
    }
  }
  return out;
}

function csvCell(v) {
  if (v === null || v === undefined) return '';
  const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
  // Quote if the value contains a comma, quote, or newline; escape quotes.
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function download(filename, content, type) {
  const blob = new Blob([content], { type: `${type};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
