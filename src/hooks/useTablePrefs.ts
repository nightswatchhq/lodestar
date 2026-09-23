'use client';

import { useCallback, useMemo, useSyncExternalStore } from 'react';
import {
  DEFAULT_PREFS,
  loadTablePrefs,
  saveTablePrefs,
  type Density,
  type TablePrefs,
} from '@/lib/table-prefs';

// The same table can be mounted twice (the indexer page keeps panels alive), and localStorage
// fires no event in the tab that wrote it.
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function storage(): Storage | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

// What this visit chose, so the picker still works where storage refuses to keep it.
const chosen = new Map<string, string>();

function readRaw(table: string): string | null {
  const mine = chosen.get(table);
  if (mine !== undefined) return mine;
  try {
    return storage()?.getItem(`lodestar:table:${table}`) ?? null;
  } catch {
    return null;
  }
}

/** A table's remembered columns and density. Defaults on the server and through hydration. */
export function useTablePrefs(table: string) {
  const raw = useSyncExternalStore(subscribe, () => readRaw(table), () => null);
  const prefs = useMemo<TablePrefs>(
    () => (raw === null ? DEFAULT_PREFS : loadTablePrefs({ getItem: () => raw }, table)),
    [raw, table],
  );

  const write = useCallback(
    (next: TablePrefs) => {
      chosen.set(table, JSON.stringify(next));
      saveTablePrefs(storage(), table, next);
      listeners.forEach((l) => l());
    },
    [table],
  );

  const setColumns = useCallback(
    (columns: Record<string, boolean>) => write({ ...prefs, columns }),
    [prefs, write],
  );
  const setDensity = useCallback((density: Density) => write({ ...prefs, density }), [prefs, write]);

  return { columns: prefs.columns, density: prefs.density, setColumns, setDensity };
}
