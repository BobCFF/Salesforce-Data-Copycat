import { useEffect, useState } from 'react';

// useState that persists to localStorage so the value survives a page refresh.
// Storage is per-viewer/per-browser and best-effort: reads and writes are
// wrapped so a private window, blocked storage, or bad JSON never breaks the UI.
export function usePersistedState(key, initial) {
  const [value, setValue] = useState(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw != null) return JSON.parse(raw);
    } catch {
      /* ignore unavailable/invalid storage */
    }
    return initial;
  });

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* ignore quota/availability errors */
    }
  }, [key, value]);

  return [value, setValue];
}
