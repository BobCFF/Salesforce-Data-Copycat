import React, { useMemo, useState } from 'react';

// Configures and launches the copy from source -> target, and shows results.
export default function CopyPanel({
  sourceObject,
  fields,
  targetConnected,
  targetObjects,
  targetMeta,
  onLoadTargetMeta,
  onCopy,
  copying,
  result,
}) {
  const [operation, setOperation] = useState('insert');
  const [targetObject, setTargetObject] = useState('');
  const [externalIdField, setExternalIdField] = useState('');
  const [useBulk, setUseBulk] = useState(true);

  const effectiveTarget = targetObject || sourceObject || '';

  const externalIdCandidates = useMemo(
    () => (targetMeta?.fields || []).filter((f) => f.externalId || f.idLookup || f.name === 'Id'),
    [targetMeta]
  );

  function chooseTarget(name) {
    setTargetObject(name);
    if (name) onLoadTargetMeta(name);
  }

  function run() {
    onCopy({
      sourceObject,
      targetObject: effectiveTarget,
      operation,
      externalIdField: operation === 'upsert' ? externalIdField : undefined,
      useBulk,
    });
  }

  const canRun =
    targetConnected &&
    sourceObject &&
    effectiveTarget &&
    fields.length > 0 &&
    (operation !== 'upsert' || externalIdField) &&
    !copying;

  return (
    <div className="copy-panel">
      <div className="pane-header">Copy to Target</div>

      {!targetConnected && <div className="copy-note">Connect the target org to enable copying.</div>}

      <div className="copy-form">
        <label>
          Target object
          <select value={effectiveTarget} onChange={(e) => chooseTarget(e.target.value)}>
            <option value="">{sourceObject ? `Same as source (${sourceObject})` : 'Select…'}</option>
            {(targetObjects || [])
              .filter((o) => o.createable || o.updateable)
              .map((o) => (
                <option key={o.name} value={o.name}>{o.name}</option>
              ))}
          </select>
        </label>

        <label>
          Operation
          <select value={operation} onChange={(e) => setOperation(e.target.value)}>
            <option value="insert">Insert</option>
            <option value="update">Update (records must have Id)</option>
            <option value="upsert">Upsert (by external Id)</option>
          </select>
        </label>

        {operation === 'upsert' && (
          <label>
            External Id field
            <select value={externalIdField} onChange={(e) => setExternalIdField(e.target.value)}>
              <option value="">Select…</option>
              {externalIdCandidates.map((f) => (
                <option key={f.name} value={f.name}>{f.name}</option>
              ))}
            </select>
          </label>
        )}

        <label className="checkbox">
          <input type="checkbox" checked={useBulk} onChange={(e) => setUseBulk(e.target.checked)} />
          Use Bulk API to load
        </label>

        <button className="btn primary block" onClick={run} disabled={!canRun}>
          {copying ? '⧗ Copying…' : `⧉ Copy ${sourceObject || ''} → ${effectiveTarget || 'target'}`}
        </button>
      </div>

      {result && (
        <div className="copy-result">
          <div className="result-summary">
            <span className="ok">✔ {result.successCount} succeeded</span>
            <span className={result.failureCount ? 'fail' : 'muted'}>
              ✖ {result.failureCount} failed
            </span>
            <span className="muted">of {result.total}</span>
          </div>
          {result.failureCount > 0 && (
            <details className="result-errors" open>
              <summary>Errors ({result.failureCount})</summary>
              <ul>
                {result.results
                  .filter((r) => !r.success)
                  .slice(0, 100)
                  .map((r, i) => (
                    <li key={i}>{(r.errors || []).join('; ') || 'Unknown error'}</li>
                  ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
