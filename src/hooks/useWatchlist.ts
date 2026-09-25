'use client';

import { useCallback, useMemo, useSyncExternalStore } from 'react';
import {
  EMPTY_WATCHLIST,
  WATCHLIST_KEY,
  isWatched,
  parseWatchlist,
  saveWatchlist,
  toggleWatch,
  type WatchKind,
} from '@/lib/watchlist';

// Every star on a page reads the same list, and localStorage fires no event in the tab that wrote it.
const listeners = new Set<() => void>();

// What this visit starred, so a star still works where storage refuses to keep it.
let chosen: string | null = null;

function subscribe(listener: () => void) {
  listeners.add(listener);
  // Another tab starring something should show here too, and what it wrote wins.
  const onStorage = (e: StorageEvent) => {
    if (e.key !== WATCHLIST_KEY) return;
    chosen = null;
    listener();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
}

function storage(): Storage | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

function readRaw(): string | null {
  if (chosen !== null) return chosen;
  try {
    return storage()?.getItem(WATCHLIST_KEY) ?? null;
  } catch {
    return null;
  }
}

/** The starred indexers and deployments. Empty on the server and through hydration. */
export function useWatchlist() {
  const raw = useSyncExternalStore(subscribe, readRaw, () => null);
  const list = useMemo(() => (raw === null ? EMPTY_WATCHLIST : parseWatchlist(raw)), [raw]);

  const toggle = useCallback((kind: WatchKind, id: string) => {
    const next = toggleWatch(parseWatchlist(readRaw()), kind, id);
    chosen = JSON.stringify(next);
    saveWatchlist(storage(), next);
    listeners.forEach((l) => l());
  }, []);

  const watched = useCallback((kind: WatchKind, id: string) => isWatched(list, kind, id), [list]);

  return { list, watched, toggle };
}
