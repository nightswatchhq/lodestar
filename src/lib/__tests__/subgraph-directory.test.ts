import { describe, expect, it } from 'vitest';
import {
  activePreset,
  applyPreset,
  deleteView,
  directoryApiQuery,
  directoryParams,
  emptyDirectoryState,
  hasFilters,
  loadSavedViews,
  parseDirectoryState,
  saveView,
} from '../subgraph-directory';

const parse = (qs: string) => parseDirectoryState(new URLSearchParams(qs));

function memoryStorage(initial: Record<string, string> = {}) {
  const m = new Map(Object.entries(initial));
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
  };
}

describe('the directory state in the URL', () => {
  it('round-trips every filter and leaves the defaults out', () => {
    const qs =
      'window=allTime&sort=ratio&dir=asc&signalMin=200&stakeMax=5000&ratioMin=5&feesMin=10&indexersMax=3' +
      '&network=arbitrum-one&complexity=Heavy&category=DeFi&createdWithinDays=30&page=2';
    const state = parse(qs);
    expect(new URLSearchParams(directoryParams(state)).toString()).toBe(new URLSearchParams(qs).toString());
    expect(directoryParams(emptyDirectoryState()).toString()).toBe('');
  });

  it('asks the API for the page as first and skip', () => {
    const q = new URLSearchParams(directoryApiQuery(parse('ratioMin=5&page=3')));
    expect(q.get('ratioMin')).toBe('5');
    expect(q.get('first')).toBe('25');
    expect(q.get('skip')).toBe('75');
    expect(q.has('page')).toBe(false);
  });

  it('drops a bound it cannot read rather than sending it on', () => {
    const state = parse('signalMin=lots&ratioMin=-1&network=all&createdWithinDays=0');
    expect(hasFilters(state)).toBe(false);
  });

  it('reads an old Elite link as the high-volume preset', () => {
    const state = parse('elite=1');
    expect(state.window).toBe('allTime');
    expect(state.ranges.fees.min).toBe(1000);
    expect(activePreset(state)).toBe('high-volume');
  });
});

describe('presets', () => {
  it('under-allocated is signal over stake above 5 with 200 GRT of signal', () => {
    const q = new URLSearchParams(directoryApiQuery(applyPreset('under-allocated')));
    expect(q.get('ratioMin')).toBe('5');
    expect(q.get('signalMin')).toBe('200');
    expect(q.get('sort')).toBe('ratio');
  });

  it('stays active when the table is re-sorted, and not when a filter is added', () => {
    const state = applyPreset('new');
    expect(activePreset({ ...state, sort: 'signal' })).toBe('new');
    expect(activePreset({ ...state, network: 'base' })).toBeNull();
    expect(activePreset(emptyDirectoryState())).toBeNull();
  });
});

describe('saved views', () => {
  it('keeps named filters and replaces a view of the same name', () => {
    const storage = memoryStorage();
    saveView(storage, 'mine', applyPreset('under-allocated'));
    const views = saveView(storage, ' mine ', parse('network=base'));
    expect(views).toEqual([{ name: 'mine', query: 'network=base' }]);
    expect(deleteView(storage, 'mine')).toEqual([]);
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
    expect(loadSavedViews(refusing)).toEqual([]);
    expect(saveView(refusing, 'x', emptyDirectoryState())).toEqual([{ name: 'x', query: '' }]);
    expect(loadSavedViews(memoryStorage({ 'lodestar:subgraph-views': '{"not":"a list"}' }))).toEqual([]);
    expect(loadSavedViews(undefined)).toEqual([]);
  });
});
