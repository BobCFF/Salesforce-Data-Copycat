import React, { useMemo, useRef, useState } from 'react';

// SOQL keywords and clause words offered by autocomplete.
const KEYWORDS = [
  'SELECT', 'FROM', 'WHERE', 'AND', 'OR', 'NOT', 'LIKE', 'IN', 'NOT IN',
  'ORDER BY', 'GROUP BY', 'HAVING', 'LIMIT', 'OFFSET', 'ASC', 'DESC',
  'NULLS FIRST', 'NULLS LAST', 'TRUE', 'FALSE', 'NULL',
  'FIELDS(ALL)', 'FIELDS(STANDARD)', 'FIELDS(CUSTOM)',
];

// SOQL functions. `insert` places the caret between the parentheses.
const FUNCTIONS = [
  { name: 'COUNT()', insert: 'COUNT(', detail: 'row / field count' },
  { name: 'COUNT_DISTINCT()', insert: 'COUNT_DISTINCT(', detail: 'distinct values' },
  { name: 'SUM()', insert: 'SUM(', detail: 'sum of a numeric field' },
  { name: 'AVG()', insert: 'AVG(', detail: 'average' },
  { name: 'MIN()', insert: 'MIN(', detail: 'minimum' },
  { name: 'MAX()', insert: 'MAX(', detail: 'maximum' },
  { name: 'CALENDAR_MONTH()', insert: 'CALENDAR_MONTH(', detail: 'group by month' },
  { name: 'CALENDAR_YEAR()', insert: 'CALENDAR_YEAR(', detail: 'group by year' },
  { name: 'CALENDAR_QUARTER()', insert: 'CALENDAR_QUARTER(', detail: 'group by quarter' },
  { name: 'DAY_ONLY()', insert: 'DAY_ONLY(', detail: 'date part of a datetime' },
  { name: 'FORMAT()', insert: 'FORMAT(', detail: 'localized format' },
  { name: 'convertCurrency()', insert: 'convertCurrency(', detail: 'convert to user currency' },
  { name: 'toLabel()', insert: 'toLabel(', detail: 'translated picklist label' },
];

// Date literals commonly used in WHERE clauses.
const DATE_LITERALS = [
  'TODAY', 'YESTERDAY', 'TOMORROW', 'THIS_WEEK', 'LAST_WEEK', 'THIS_MONTH',
  'LAST_MONTH', 'THIS_YEAR', 'LAST_YEAR', 'LAST_N_DAYS:', 'NEXT_N_DAYS:',
];

// Measure the pixel position of the caret inside the textarea via a mirror div.
function caretCoords(ta, mirror, pos) {
  const style = getComputedStyle(ta);
  const copy = [
    'boxSizing', 'width', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
    'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth',
    'fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing', 'textIndent',
  ];
  copy.forEach((p) => { mirror.style[p] = style[p]; });
  mirror.style.position = 'absolute';
  mirror.style.visibility = 'hidden';
  mirror.style.whiteSpace = 'pre-wrap';
  mirror.style.wordWrap = 'break-word';
  mirror.style.overflow = 'hidden';
  mirror.style.width = `${ta.clientWidth}px`;
  mirror.textContent = ta.value.slice(0, pos);
  const marker = document.createElement('span');
  marker.textContent = ta.value.slice(pos) || '.';
  mirror.appendChild(marker);
  const lineHeight = parseInt(style.lineHeight, 10) || 16;
  const top = marker.offsetTop - ta.scrollTop + lineHeight + 2;
  const left = Math.min(marker.offsetLeft, ta.clientWidth - 8);
  mirror.removeChild(marker);
  return { top, left };
}

export default function SoqlEditor({
  value, onChange, meta, objects = [], onRun, onCheck, running, canRun,
  history = [], onPickHistory, onClearHistory,
}) {
  const taRef = useRef(null);
  const mirrorRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [active, setActive] = useState(0);
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const [checking, setChecking] = useState(false);
  const [check, setCheck] = useState(null); // { valid, text }
  const [histOpen, setHistOpen] = useState(false);
  const tokenRef = useRef({ start: 0, end: 0 });

  async function runCheck() {
    if (!onCheck || checking) return;
    setChecking(true);
    setCheck(null);
    try {
      const res = await onCheck(value.trim());
      setCheck(
        res?.valid
          ? { valid: true, text: 'Valid SOQL — the query parsed against the org.' }
          : { valid: false, text: res?.error || 'Invalid SOQL.' },
      );
    } catch (err) {
      setCheck({ valid: false, text: err.message });
    } finally {
      setChecking(false);
    }
  }

  const fieldNames = useMemo(() => (meta?.fields || []).map((f) => ({ name: f.name, detail: f.type })), [meta]);
  const objectNames = useMemo(() => objects.map((o) => o.name), [objects]);

  // Word immediately before the caret (letters, digits, underscore, dot, colon).
  function currentToken(ta) {
    const pos = ta.selectionStart;
    const text = ta.value.slice(0, pos);
    const m = text.match(/[A-Za-z0-9_.:]*$/);
    const token = m ? m[0] : '';
    return { token, start: pos - token.length, end: pos };
  }

  // Is the caret positioned right after the FROM keyword?
  function afterFrom(ta, start) {
    const before = ta.value.slice(0, start).trimEnd();
    return /\bFROM$/i.test(before);
  }

  function buildSuggestions(ta) {
    const { token, start } = currentToken(ta);
    const q = token.toLowerCase();
    let pool;
    if (afterFrom(ta, start)) {
      // Right after FROM → object names first.
      pool = [
        ...objectNames.map((n) => ({ label: n, insert: n, kind: 'object' })),
      ];
    } else {
      pool = [
        ...fieldNames.map((f) => ({ label: f.name, insert: f.name, detail: f.detail, kind: 'field' })),
        ...FUNCTIONS.map((f) => ({ label: f.name, insert: f.insert, detail: f.detail, kind: 'fn' })),
        ...KEYWORDS.map((k) => ({ label: k, insert: k, kind: 'kw' })),
        ...DATE_LITERALS.map((d) => ({ label: d, insert: d, kind: 'date' })),
      ];
    }
    if (!q) return pool.slice(0, 40);
    const starts = [];
    const contains = [];
    for (const s of pool) {
      const l = s.label.toLowerCase();
      if (l.startsWith(q)) starts.push(s);
      else if (l.includes(q)) contains.push(s);
    }
    return [...starts, ...contains].slice(0, 40);
  }

  function refresh() {
    const ta = taRef.current;
    if (!ta) return;
    const { start, end } = currentToken(ta);
    tokenRef.current = { start, end };
    const list = buildSuggestions(ta);
    setItems(list);
    setActive(0);
    if (list.length) {
      setCoords(caretCoords(ta, mirrorRef.current, ta.selectionStart));
      setOpen(true);
    } else {
      setOpen(false);
    }
  }

  function accept(item) {
    const ta = taRef.current;
    const { start, end } = tokenRef.current;
    const before = ta.value.slice(0, start);
    const after = ta.value.slice(end);
    // Functions/FIELDS() insert an opening paren; place caret inside it.
    const isFn = /\($/.test(item.insert);
    const insertText = isFn ? `${item.insert})` : item.insert;
    const next = before + insertText + after;
    onChange(next);
    setOpen(false);
    // Restore focus + caret after React re-renders the value.
    const caret = before.length + item.insert.length; // just after '(' for functions
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(caret, caret);
    });
  }

  function onKeyDown(e) {
    // Run with Cmd/Ctrl+Enter regardless of the dropdown.
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      if (canRun && !running) onRun();
      return;
    }
    if (!open || !items.length) {
      if (e.key === ' ' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        refresh();
      }
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => (a + 1) % items.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => (a - 1 + items.length) % items.length);
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      accept(items[active]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
    }
  }

  return (
    <div className="soql-editor">
      <div className="soql-actions">
        <button className="btn small primary" onClick={onRun} disabled={!canRun || running}>
          {running ? 'Running…' : '▶ Run'}
        </button>
        <button className="btn small" onClick={runCheck} disabled={!value.trim() || checking}>
          {checking ? 'Checking…' : '✓ Check syntax'}
        </button>
        <div className="soql-history">
          <button
            className="btn small"
            onClick={() => setHistOpen((o) => !o)}
            disabled={!history.length}
            title={history.length ? 'Recently run queries' : 'No query history yet'}
          >
            🕘 History{history.length ? ` (${history.length})` : ''} ▾
          </button>
          {histOpen && history.length > 0 && (
            <>
              <div className="soql-history-overlay" onClick={() => setHistOpen(false)} />
              <ul className="soql-history-menu">
                {history.map((q, i) => (
                  <li
                    key={i}
                    title={q}
                    onClick={() => { onPickHistory?.(q); setHistOpen(false); setCheck(null); }}
                  >
                    {q.replace(/\s+/g, ' ').trim()}
                  </li>
                ))}
                <li className="soql-history-clear" onClick={() => { onClearHistory?.(); setHistOpen(false); }}>
                  Clear history
                </li>
              </ul>
            </>
          )}
        </div>
        {check && (
          <span className={`soql-check ${check.valid ? 'ok' : 'bad'}`}>
            {check.valid ? '✓ ' : '✕ '}{check.text}
          </span>
        )}
      </div>
      <div className="soql-editor-hint">
        Type to autocomplete fields, objects, keywords and functions. <kbd>Ctrl</kbd>+<kbd>Space</kbd> to
        re-open · <kbd>Tab</kbd>/<kbd>Enter</kbd> to insert · <kbd>Ctrl</kbd>+<kbd>Enter</kbd> to run.
      </div>
      <div className="soql-wrap">
        <textarea
          ref={taRef}
          className="soql-textarea"
          spellCheck={false}
          value={value}
          placeholder="SELECT Id, Name FROM Account WHERE CreatedDate = THIS_MONTH LIMIT 200"
          onChange={(e) => { onChange(e.target.value); if (check) setCheck(null); }}
          onKeyUp={(e) => {
            // Recompute suggestions on typing / navigation, but not on the keys
            // the dropdown itself handles.
            if (['ArrowDown', 'ArrowUp', 'Enter', 'Tab', 'Escape'].includes(e.key)) return;
            refresh();
          }}
          onKeyDown={onKeyDown}
          onClick={() => setOpen(false)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
        />
        <div ref={mirrorRef} className="soql-mirror" aria-hidden="true" />
        {open && items.length > 0 && (
          <ul className="soql-suggest" style={{ top: coords.top, left: coords.left }}>
            {items.map((it, i) => (
              <li
                key={`${it.kind}-${it.label}`}
                className={i === active ? 'active' : ''}
                onMouseDown={(e) => { e.preventDefault(); accept(it); }}
                onMouseEnter={() => setActive(i)}
              >
                <span className={`sg-kind sg-${it.kind}`}>{it.kind}</span>
                <span className="sg-label">{it.label}</span>
                {it.detail && <span className="sg-detail">{it.detail}</span>}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="soql-fnbar">
        <span className="muted small">Functions:</span>
        {FUNCTIONS.slice(0, 8).map((f) => (
          <button
            key={f.name}
            className="chip"
            title={f.detail}
            onClick={() => {
              const ta = taRef.current;
              tokenRef.current = { start: ta.selectionStart, end: ta.selectionEnd };
              accept({ insert: f.insert });
            }}
          >
            {f.name}
          </button>
        ))}
      </div>
    </div>
  );
}
