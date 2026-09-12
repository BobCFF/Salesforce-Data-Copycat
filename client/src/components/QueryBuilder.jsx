import React, { useMemo, useState } from 'react';

const OPERATORS = ['=', '!=', '<', '<=', '>', '>=', 'LIKE', 'IN', 'NOT IN'];

// Builds the structured selection (fields, WHERE filters, ORDER BY, LIMIT)
// that the server turns into SOQL. Also supports a raw-SOQL escape hatch.
export default function QueryBuilder({ meta, loading, value, onChange, soqlPreview }) {
  const [fieldFilter, setFieldFilter] = useState('');

  const fields = meta?.fields || [];
  const filteredFields = useMemo(() => {
    const q = fieldFilter.trim().toLowerCase();
    if (!q) return fields;
    return fields.filter(
      (f) => f.name.toLowerCase().includes(q) || (f.label || '').toLowerCase().includes(q)
    );
  }, [fields, fieldFilter]);

  function set(patch) {
    onChange({ ...value, ...patch });
  }

  function toggleField(name) {
    const has = value.fields.includes(name);
    set({ fields: has ? value.fields.filter((f) => f !== name) : [...value.fields, name] });
  }

  function selectAll() {
    set({ fields: fields.filter((f) => f.type !== 'address' && f.type !== 'location').map((f) => f.name) });
  }
  function selectNone() {
    set({ fields: ['Id'] });
  }

  function addFilter() {
    set({ filters: [...value.filters, { field: fields[0]?.name || 'Id', op: '=', value: '' }] });
  }
  function updateFilter(i, patch) {
    const filters = value.filters.map((f, idx) => (idx === i ? { ...f, ...patch } : f));
    set({ filters });
  }
  function removeFilter(i) {
    set({ filters: value.filters.filter((_, idx) => idx !== i) });
  }

  function addSort() {
    set({ orderBy: [...value.orderBy, { field: fields[0]?.name || 'Id', dir: 'ASC' }] });
  }
  function updateSort(i, patch) {
    set({ orderBy: value.orderBy.map((o, idx) => (idx === i ? { ...o, ...patch } : o)) });
  }
  function removeSort(i) {
    set({ orderBy: value.orderBy.filter((_, idx) => idx !== i) });
  }

  if (!meta && !loading) {
    return <div className="qb-empty">Select an object from the tree to build a query.</div>;
  }

  return (
    <div className="query-builder">
      {loading && <div className="qb-empty">Describing {value.sobject}…</div>}

      {meta && (
        <>
          <section className="qb-section">
            <div className="qb-section-head">
              <span>Fields ({value.fields.length}/{fields.length})</span>
              <span className="qb-head-actions">
                <button className="link" onClick={selectAll}>All</button>
                <button className="link" onClick={selectNone}>None</button>
              </span>
            </div>
            <input
              className="qb-field-filter"
              placeholder="Filter fields…"
              value={fieldFilter}
              onChange={(e) => setFieldFilter(e.target.value)}
            />
            <div className="field-list">
              {filteredFields.map((f) => (
                <label key={f.name} className="field-item" title={`${f.type}${f.externalId ? ' • external id' : ''}`}>
                  <input
                    type="checkbox"
                    checked={value.fields.includes(f.name)}
                    onChange={() => toggleField(f.name)}
                  />
                  <span className="field-name">{f.name}</span>
                  <span className="field-type">{f.type}</span>
                </label>
              ))}
            </div>
          </section>

          <section className="qb-section">
            <div className="qb-section-head">
              <span>Filters (WHERE)</span>
              <span className="qb-head-actions">
                <select
                  value={value.filterLogic}
                  onChange={(e) => set({ filterLogic: e.target.value })}
                  title="How to combine filters"
                >
                  <option value="AND">Match ALL (AND)</option>
                  <option value="OR">Match ANY (OR)</option>
                </select>
                <button className="link" onClick={addFilter}>+ Add</button>
              </span>
            </div>
            {value.filters.map((f, i) => (
              <div className="filter-line" key={i}>
                <select value={f.field} onChange={(e) => updateFilter(i, { field: e.target.value })}>
                  {fields.map((fl) => (
                    <option key={fl.name} value={fl.name}>{fl.name}</option>
                  ))}
                </select>
                <select value={f.op} onChange={(e) => updateFilter(i, { op: e.target.value })}>
                  {OPERATORS.map((op) => (
                    <option key={op} value={op}>{op}</option>
                  ))}
                </select>
                <input
                  value={f.value}
                  placeholder="value"
                  onChange={(e) => updateFilter(i, { value: e.target.value })}
                />
                <button className="link danger" onClick={() => removeFilter(i)}>✕</button>
              </div>
            ))}
          </section>

          <section className="qb-section">
            <div className="qb-section-head">
              <span>Sort (ORDER BY)</span>
              <span className="qb-head-actions">
                <button className="link" onClick={addSort}>+ Add</button>
              </span>
            </div>
            {value.orderBy.map((o, i) => (
              <div className="filter-line" key={i}>
                <select value={o.field} onChange={(e) => updateSort(i, { field: e.target.value })}>
                  {fields.map((fl) => (
                    <option key={fl.name} value={fl.name}>{fl.name}</option>
                  ))}
                </select>
                <select value={o.dir} onChange={(e) => updateSort(i, { dir: e.target.value })}>
                  <option value="ASC">ASC</option>
                  <option value="DESC">DESC</option>
                </select>
                <button className="link danger" onClick={() => removeSort(i)}>✕</button>
              </div>
            ))}
          </section>

          <section className="qb-section">
            <div className="qb-section-head"><span>Options</span></div>
            <div className="qb-options">
              <label>
                Row limit
                <input
                  type="number"
                  min="1"
                  value={value.limit}
                  onChange={(e) => set({ limit: e.target.value })}
                />
              </label>
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={value.useBulk}
                  onChange={(e) => set({ useBulk: e.target.checked })}
                />
                Use Bulk API (large data volumes)
              </label>
            </div>
          </section>

          {soqlPreview && (
            <section className="qb-section">
              <div className="qb-section-head"><span>SOQL preview</span></div>
              <pre className="soql-preview">{soqlPreview}</pre>
            </section>
          )}
        </>
      )}
    </div>
  );
}
