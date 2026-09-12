import React, { useMemo, useState } from 'react';

// A Windows Explorer-style tree of Salesforce objects, grouped into
// "Standard Objects" and "Custom Objects" folders, with a live filter box.
export default function ObjectTree({ objects, loading, selected, onSelect, title }) {
  const [filter, setFilter] = useState('');
  const [open, setOpen] = useState({ standard: true, custom: true });

  const groups = useMemo(() => {
    const q = filter.trim().toLowerCase();
    const match = (o) =>
      !q || o.name.toLowerCase().includes(q) || (o.label || '').toLowerCase().includes(q);
    const queryable = (objects || []).filter((o) => o.queryable && match(o));
    return {
      standard: queryable.filter((o) => !o.custom).sort(byLabel),
      custom: queryable.filter((o) => o.custom).sort(byLabel),
    };
  }, [objects, filter]);

  return (
    <div className="tree-pane">
      <div className="pane-header">{title || 'Objects'}</div>
      <div className="tree-filter">
        <input
          type="text"
          placeholder="Filter objects…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
      </div>
      <div className="tree-body" role="tree">
        {loading && <div className="tree-empty">Loading objects…</div>}
        {!loading && !objects?.length && (
          <div className="tree-empty">Connect to a source org to browse objects.</div>
        )}
        {!loading && objects?.length > 0 && (
          <>
            <TreeFolder
              label={`Standard Objects (${groups.standard.length})`}
              open={open.standard}
              onToggle={() => setOpen((s) => ({ ...s, standard: !s.standard }))}
            >
              {groups.standard.map((o) => (
                <TreeLeaf
                  key={o.name}
                  object={o}
                  selected={selected === o.name}
                  onSelect={onSelect}
                />
              ))}
            </TreeFolder>
            <TreeFolder
              label={`Custom Objects (${groups.custom.length})`}
              open={open.custom}
              onToggle={() => setOpen((s) => ({ ...s, custom: !s.custom }))}
            >
              {groups.custom.map((o) => (
                <TreeLeaf
                  key={o.name}
                  object={o}
                  selected={selected === o.name}
                  onSelect={onSelect}
                />
              ))}
            </TreeFolder>
          </>
        )}
      </div>
    </div>
  );
}

function byLabel(a, b) {
  return (a.label || a.name).localeCompare(b.label || b.name);
}

function TreeFolder({ label, open, onToggle, children }) {
  return (
    <div className="tree-folder">
      <div className="tree-row folder" onClick={onToggle} role="treeitem" aria-expanded={open}>
        <span className="twisty">{open ? '▾' : '▸'}</span>
        <span className="icon folder-icon">{open ? '📂' : '📁'}</span>
        <span className="tree-label">{label}</span>
      </div>
      {open && <div className="tree-children">{children}</div>}
    </div>
  );
}

function TreeLeaf({ object, selected, onSelect }) {
  return (
    <div
      className={`tree-row leaf${selected ? ' selected' : ''}`}
      onClick={() => onSelect(object.name)}
      role="treeitem"
      aria-selected={selected}
      title={`${object.label} (${object.name})`}
    >
      <span className="twisty" />
      <span className="icon">{object.custom ? '🧩' : '📄'}</span>
      <span className="tree-label">{object.label}</span>
      <span className="tree-api">{object.name}</span>
    </div>
  );
}
