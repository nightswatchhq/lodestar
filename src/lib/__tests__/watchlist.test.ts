import { describe, expect, it } from 'vitest';
import {
  EMPTY_WATCHLIST,
  WATCHLIST_KEY,
  isWatched,
  loadWatchlist,
  parseWatchlist,
  saveWatchlist,
  toggleWatch,
} from '../watchlist';

function memoryStorage(initial: Record<string, string> = {}) {
  const m = new Map(Object.entries(initial));
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
  };
}

const PINAX = '0xEDCA8740873152ff30a2696add66d1ab41882beb';
const HASH = 'QmZ6iEiUhPdUWbSJUYkiB75zjqvaVq2pcuR5X9bxp9jiQ1';

describe('toggleWatch', () => {
  it('stars and unstars, newest first', () => {
    let list = toggleWatch(EMPTY_WATCHLIST, 'indexer', '0xaaa');
    list = toggleWatch(list, 'indexer', PINAX);
    list = toggleWatch(list, 'subgraph', HASH);
    expect(list).toEqual({ indexers: [PINAX.toLowerCase(), '0xaaa'], subgraphs: [HASH] });
    expect(toggleWatch(list, 'indexer', '0xaaa').indexers).toEqual([PINAX.toLowerCase()]);
  });

  it('matches an address whatever its case, and a hash only exactly', () => {
    const list = toggleWatch(toggleWatch(EMPTY_WATCHLIST, 'indexer', PINAX), 'subgraph', HASH);
    expect(isWatched(list, 'indexer', PINAX.toLowerCase())).toBe(true);
    expect(isWatched(list, 'subgraph', HASH.toLowerCase())).toBe(false);
    expect(toggleWatch(list, 'indexer', PINAX.toUpperCase().replace('0X', '0x')).indexers).toEqual([]);
  });

  it('ignores an empty id', () => {
    expect(toggleWatch(EMPTY_WATCHLIST, 'subgraph', '  ')).toBe(EMPTY_WATCHLIST);
  });
});

describe('watchlist in storage', () => {
  it('round-trips', () => {
    const storage = memoryStorage();
    const list = toggleWatch(toggleWatch(EMPTY_WATCHLIST, 'indexer', PINAX), 'subgraph', HASH);
    saveWatchlist(storage, list);
    expect(loadWatchlist(storage)).toEqual(list);
  });

  it('survives storage that refuses or holds something else', () => {
    const refusing = {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
    };
    expect(loadWatchlist(refusing)).toEqual(EMPTY_WATCHLIST);
    expect(saveWatchlist(refusing, { indexers: ['0xa'], subgraphs: [] })).toEqual({ indexers: ['0xa'], subgraphs: [] });
    expect(loadWatchlist(undefined)).toEqual(EMPTY_WATCHLIST);
    expect(loadWatchlist(memoryStorage({ [WATCHLIST_KEY]: 'not json' }))).toEqual(EMPTY_WATCHLIST);
    expect(parseWatchlist('[1,2]')).toEqual(EMPTY_WATCHLIST);
  });

  it('keeps only the strings it can use, once each', () => {
    const raw = JSON.stringify({ indexers: [PINAX, PINAX.toLowerCase(), 7, ''], subgraphs: [HASH, HASH, null] });
    expect(parseWatchlist(raw)).toEqual({ indexers: [PINAX.toLowerCase()], subgraphs: [HASH] });
  });
});
