/**
 * The indexers and deployments someone has starred, kept in localStorage.
 *
 * Local first, per #257: once alerts exist (#256) a watchlist is what gets subscribed to, and it
 * moves to kittiwake keyed by a signed address. Until then it lives in this browser only.
 */

export type WatchKind = 'indexer' | 'subgraph';

export type Watchlist = { indexers: string[]; subgraphs: string[] };

export const EMPTY_WATCHLIST: Watchlist = { indexers: [], subgraphs: [] };

export const WATCHLIST_KEY = 'lodestar:watchlist';

/** Addresses compare case-blind; an IPFS hash is case-sensitive and kept as given. */
export function watchId(kind: WatchKind, id: string): string {
  const trimmed = id.trim();
  return kind === 'indexer' ? trimmed.toLowerCase() : trimmed;
}

function ids(kind: WatchKind, value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const kept = value.filter((v): v is string => typeof v === 'string' && v.trim() !== '');
  return [...new Set(kept.map((v) => watchId(kind, v)))];
}

export function parseWatchlist(raw: string | null | undefined): Watchlist {
  if (!raw) return EMPTY_WATCHLIST;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return EMPTY_WATCHLIST;
    const p = parsed as { indexers?: unknown; subgraphs?: unknown };
    return {
      indexers: ids('indexer', p.indexers),
      subgraphs: ids('subgraph', p.subgraphs),
    };
  } catch {
    return EMPTY_WATCHLIST;
  }
}

export function loadWatchlist(storage: Pick<Storage, 'getItem'> | undefined): Watchlist {
  try {
    return parseWatchlist(storage?.getItem(WATCHLIST_KEY));
  } catch {
    return EMPTY_WATCHLIST;
  }
}

export function saveWatchlist(storage: Pick<Storage, 'setItem'> | undefined, list: Watchlist): Watchlist {
  try {
    storage?.setItem(WATCHLIST_KEY, JSON.stringify(list));
  } catch {
    // Kept for this visit only.
  }
  return list;
}

export function isWatched(list: Watchlist, kind: WatchKind, id: string): boolean {
  const key = watchId(kind, id);
  return (kind === 'indexer' ? list.indexers : list.subgraphs).includes(key);
}

/** Stars or unstars one entry. Newest first, so the page shows what was just added at the top. */
export function toggleWatch(list: Watchlist, kind: WatchKind, id: string): Watchlist {
  const key = watchId(kind, id);
  if (!key) return list;
  const field = kind === 'indexer' ? 'indexers' : 'subgraphs';
  const current = list[field];
  const next = current.includes(key) ? current.filter((k) => k !== key) : [key, ...current];
  return { ...list, [field]: next };
}
