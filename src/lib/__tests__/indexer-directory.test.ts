import { describe, expect, it } from 'vitest';
import {
  DEFAULT_INDEXER_DIRECTORY,
  applyIndexerDirectoryState,
  parseIndexerDirectoryState,
  type IndexerDirectoryState,
} from '../indexer-directory';

const parse = (qs: string) => parseIndexerDirectoryState(new URLSearchParams(qs));
const write = (state: IndexerDirectoryState, qs = '') => {
  const p = new URLSearchParams(qs);
  applyIndexerDirectoryState(p, state);
  return p.toString();
};

describe('the indexer directory state in the URL', () => {
  it('is empty for the defaults, so the plain directory keeps its plain URL', () => {
    expect(parse('')).toEqual(DEFAULT_INDEXER_DIRECTORY);
    expect(write(DEFAULT_INDEXER_DIRECTORY)).toBe('');
  });

  it('round-trips sort, direction, search and minimum stake', () => {
    const qs = 'sort=apr&dir=asc&q=pops+one&minStake=1000000';
    const state = parse(qs);
    expect(state).toEqual({ sort: { id: 'apr', desc: false }, q: 'pops one', minStake: 1_000_000 });
    expect(write(state)).toBe(qs);
  });

  it('keeps an ascending sort on the default column without naming it', () => {
    const state = { ...DEFAULT_INDEXER_DIRECTORY, sort: { id: 'score' as const, desc: false } };
    expect(write(state)).toBe('dir=asc');
    expect(parse('dir=asc').sort).toEqual({ id: 'score', desc: false });
  });

  it('writes a cleared sort, so a shared link does not come back sorted by score', () => {
    const state = { ...DEFAULT_INDEXER_DIRECTORY, sort: null };
    expect(write(state)).toBe('sort=none');
    expect(parse('sort=none').sort).toBeNull();
  });

  it('falls back to the default for a column or stake it does not know', () => {
    const state = parse('sort=__proto__&minStake=123&dir=sideways');
    expect(state.sort).toEqual({ id: 'score', desc: true });
    expect(state.minStake).toBe(100_000);
    expect(parse('minStake=0').minStake).toBe(0);
  });

  it('leaves other keys on the URL alone', () => {
    expect(write({ ...DEFAULT_INDEXER_DIRECTORY, q: 'x' }, 'utm=a&q=old&minStake=0')).toBe('utm=a&q=x');
  });
});
