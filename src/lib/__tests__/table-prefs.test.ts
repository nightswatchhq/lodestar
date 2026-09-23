import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PREFS,
  columnClass,
  isColumnVisible,
  loadTablePrefs,
  saveTablePrefs,
  toggleColumn,
  type ColumnSpec,
} from '../table-prefs';

function memoryStorage(initial: Record<string, string> = {}) {
  const m = new Map(Object.entries(initial));
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
  };
}

const plain: ColumnSpec = { id: 'apr', label: 'APR' };
const optional: ColumnSpec = { id: 'queryCut', label: 'Query Cut', defaultVisible: false };
const narrow: ColumnSpec = { id: 'signalled', label: 'Signalled', hideBelow: 'lg' };

describe('column choices', () => {
  it('shows the defaults, breakpoints included, while nothing is chosen', () => {
    expect(isColumnVisible(plain, {})).toBe(true);
    expect(isColumnVisible(optional, {})).toBe(false);
    expect(columnClass(narrow, {})).toBe('hidden lg:table-cell');
    expect(columnClass(plain, {})).toBe('');
  });

  it('stores only what differs from the default', () => {
    const off = toggleColumn(plain, {});
    expect(off).toEqual({ apr: false });
    expect(toggleColumn(plain, off)).toEqual({});
    const on = toggleColumn(optional, {});
    expect(on).toEqual({ queryCut: true });
    expect(toggleColumn(optional, on)).toEqual({});
  });

  it('shows a column at every width once it has been asked for', () => {
    const off = toggleColumn(narrow, {});
    expect(isColumnVisible(narrow, off)).toBe(false);
    const on = toggleColumn(narrow, off);
    expect(on).toEqual({ signalled: true });
    expect(columnClass(narrow, on)).toBe('');
  });
});

describe('table prefs in storage', () => {
  it('round-trips per table', () => {
    const storage = memoryStorage();
    saveTablePrefs(storage, 'indexers', { columns: { apr: false }, density: 'compact' });
    expect(loadTablePrefs(storage, 'indexers')).toEqual({ columns: { apr: false }, density: 'compact' });
    expect(loadTablePrefs(storage, 'subgraphs')).toEqual(DEFAULT_PREFS);
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
    expect(loadTablePrefs(refusing, 'indexers')).toEqual(DEFAULT_PREFS);
    const prefs = { columns: { apr: false }, density: 'compact' as const };
    expect(saveTablePrefs(refusing, 'indexers', prefs)).toEqual(prefs);
    expect(loadTablePrefs(undefined, 'indexers')).toEqual(DEFAULT_PREFS);

    const junk = memoryStorage({
      'lodestar:table:indexers': '{"columns":{"apr":"no","fees":false,"x":1},"density":"tiny"}',
      'lodestar:table:subgraphs': 'not json',
    });
    expect(loadTablePrefs(junk, 'indexers')).toEqual({ columns: { fees: false }, density: 'comfortable' });
    expect(loadTablePrefs(junk, 'subgraphs')).toEqual(DEFAULT_PREFS);
  });
});
