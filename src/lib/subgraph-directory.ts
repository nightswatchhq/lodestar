/**
 * The subgraph directory's state, which lives in the URL: filters, sort and page.
 *
 * The same keys go to kittiwake's `/api/subgraph-directory`, which filters the whole deployment set.
 * The browser used to filter only the 25 rows it had, so a filtered view missed every match on the
 * other pages (#252). A preset is just a set of these keys, and a saved view is a named query string.
 */

import { parseColumnChoices } from '@/lib/table-prefs';
import type { DirectoryPage, DirectoryRow } from '@/lib/api';
import { signalStakeRatio } from '@/lib/allocation-ratio';
import { toCsv, weiToGRTExact } from '@/lib/csv';
import { weiToGRT } from '@/lib/utils';

export const DIRECTORY_PAGE_SIZE = 25;

export type FeeWindow = '30d' | 'allTime';
export type DirectorySortKey = 'queryFees' | 'signal' | 'stake' | 'created' | 'ratio' | 'indexers' | 'curators';
export type Bound = { min: number | null; max: number | null };
export const RANGE_KEYS = ['signal', 'stake', 'ratio', 'fees', 'indexers'] as const;
export type RangeKey = (typeof RANGE_KEYS)[number];

export type DirectoryState = {
  window: FeeWindow;
  sort: DirectorySortKey;
  dir: 'asc' | 'desc';
  page: number;
  ranges: Record<RangeKey, Bound>;
  network: string | null;
  complexity: string | null;
  category: string | null;
  createdWithinDays: number | null;
};

const SORT_KEYS: readonly DirectorySortKey[] = ['queryFees', 'signal', 'stake', 'created', 'ratio', 'indexers', 'curators'];

/** What the old Elite toggle meant: lifetime query fees over this many GRT. */
export const HIGH_VOLUME_FEES_GRT = 1000;

const OPEN: Bound = { min: null, max: null };

export function emptyDirectoryState(): DirectoryState {
  return {
    window: '30d',
    sort: 'queryFees',
    dir: 'desc',
    page: 0,
    ranges: { signal: OPEN, stake: OPEN, ratio: OPEN, fees: OPEN, indexers: OPEN },
    network: null,
    complexity: null,
    category: null,
    createdWithinDays: null,
  };
}

function bound(value: string | null): number | null {
  if (value === null || value.trim() === '') return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function label(value: string | null): string | null {
  return value && value !== 'all' ? value : null;
}

export function parseDirectoryState(params: URLSearchParams): DirectoryState {
  const state = emptyDirectoryState();
  state.window = params.get('window') === 'allTime' ? 'allTime' : '30d';
  const sort = params.get('sort');
  if (sort && (SORT_KEYS as readonly string[]).includes(sort)) state.sort = sort as DirectorySortKey;
  state.dir = params.get('dir') === 'asc' ? 'asc' : 'desc';
  state.page = Math.max(0, Math.floor(Number(params.get('page')) || 0));
  for (const k of RANGE_KEYS) {
    state.ranges[k] = { min: bound(params.get(`${k}Min`)), max: bound(params.get(`${k}Max`)) };
  }
  state.network = label(params.get('network'));
  state.complexity = label(params.get('complexity'));
  state.category = label(params.get('category'));
  const days = bound(params.get('createdWithinDays'));
  state.createdWithinDays = days !== null && days >= 1 ? Math.floor(days) : null;

  // Links saved before the Elite toggle became the high-volume preset still mean what they meant.
  if (params.get('elite') === '1' && state.ranges.fees.min === null) {
    state.window = 'allTime';
    state.ranges.fees = { ...state.ranges.fees, min: HIGH_VOLUME_FEES_GRT };
  }
  return state;
}

/** The filter and sort keys, defaults left out so the URL stays short. No page, no search. */
function filterParams(state: DirectoryState): URLSearchParams {
  const p = new URLSearchParams();
  if (state.window !== '30d') p.set('window', state.window);
  if (state.sort !== 'queryFees') p.set('sort', state.sort);
  if (state.dir !== 'desc') p.set('dir', state.dir);
  for (const k of RANGE_KEYS) {
    const b = state.ranges[k];
    if (b.min !== null) p.set(`${k}Min`, String(b.min));
    if (b.max !== null) p.set(`${k}Max`, String(b.max));
  }
  if (state.network) p.set('network', state.network);
  if (state.complexity) p.set('complexity', state.complexity);
  if (state.category) p.set('category', state.category);
  if (state.createdWithinDays !== null) p.set('createdWithinDays', String(state.createdWithinDays));
  return p;
}

/** The page's own query string: the filters, then the page. */
export function directoryParams(state: DirectoryState): URLSearchParams {
  const p = filterParams(state);
  if (state.page > 0) p.set('page', String(state.page));
  return p;
}

/** The query string for `/api/subgraph-directory`: the filters, with the page as `first` and `skip`. */
export function directoryApiQuery(state: DirectoryState, pageSize = DIRECTORY_PAGE_SIZE): string {
  const p = filterParams(state);
  p.set('first', String(pageSize));
  if (state.page > 0) p.set('skip', String(state.page * pageSize));
  return p.toString();
}

export function hasFilters(state: DirectoryState): boolean {
  return (
    RANGE_KEYS.some((k) => state.ranges[k].min !== null || state.ranges[k].max !== null) ||
    state.network !== null ||
    state.complexity !== null ||
    state.category !== null ||
    state.createdWithinDays !== null
  );
}

export type Preset = {
  id: 'under-allocated' | 'high-volume' | 'new';
  label: string;
  title: string;
  apply: (s: DirectoryState) => DirectoryState;
};

/**
 * mindstyle's screen reads signal over allocated stake, the way #250 settled the column: above 5,
 * with at least 200 GRT of signal. A deployment with nothing allocated passes it.
 */
export const PRESETS: readonly Preset[] = [
  {
    id: 'under-allocated',
    label: 'Under-allocated',
    title: 'Signal over allocated stake above 5, with at least 200 GRT of signal',
    apply: (s) => ({
      ...s,
      sort: 'ratio',
      dir: 'desc',
      ranges: { ...s.ranges, ratio: { min: 5, max: null }, signal: { min: 200, max: null } },
    }),
  },
  {
    id: 'high-volume',
    label: 'High query volume',
    title: `Over ${HIGH_VOLUME_FEES_GRT.toLocaleString()} GRT in query fees, all time`,
    apply: (s) => ({
      ...s,
      window: 'allTime',
      sort: 'queryFees',
      dir: 'desc',
      ranges: { ...s.ranges, fees: { min: HIGH_VOLUME_FEES_GRT, max: null } },
    }),
  },
  {
    id: 'new',
    label: 'New deployments',
    title: 'Created in the last 30 days',
    apply: (s) => ({ ...s, sort: 'created', dir: 'desc', createdWithinDays: 30 }),
  },
];

/** The preset whose filters these are, whatever the sort, or null. One with a filter added is not it. */
export function activePreset(state: DirectoryState): Preset['id'] | null {
  const filtersOf = (s: DirectoryState) => filterParams({ ...s, sort: 'queryFees', dir: 'desc' }).toString();
  const current = filtersOf(state);
  return PRESETS.find((p) => filtersOf(p.apply(emptyDirectoryState())) === current)?.id ?? null;
}

export function applyPreset(id: Preset['id']): DirectoryState {
  const preset = PRESETS.find((p) => p.id === id);
  return preset ? preset.apply(emptyDirectoryState()) : emptyDirectoryState();
}

// ---------- export ----------

/** The largest page kittiwake serves. */
export const DIRECTORY_EXPORT_PAGE = 100;

/** Every row matching the state's filters, in its sort, walked a page at a time. */
export async function fetchWholeDirectory(
  state: DirectoryState,
  fetchPage: (query: string) => Promise<DirectoryPage>,
): Promise<DirectoryRow[]> {
  const rows: DirectoryRow[] = [];
  for (let page = 0; ; page++) {
    const answer = await fetchPage(directoryApiQuery({ ...state, page }, DIRECTORY_EXPORT_PAGE));
    rows.push(...answer.data);
    if (answer.data.length < DIRECTORY_EXPORT_PAGE || rows.length >= answer.total) return rows;
  }
}

export function directoryCsv(rows: DirectoryRow[]): string {
  return toCsv(
    [
      'ipfs_hash', 'deployment_id', 'name', 'network', 'complexity', 'categories', 'signal_grt',
      'stake_grt', 'signal_stake_ratio', 'query_fees_30d_grt', 'query_fees_all_time_grt', 'indexers',
      'curators', 'created_at',
    ],
    rows.map((r) => [
      r.ipfsHash,
      r.id,
      r.displayName,
      r.network,
      r.complexity,
      r.categories.join('; '),
      weiToGRTExact(r.signalledTokens),
      weiToGRTExact(r.stakedTokens),
      signalStakeRatio(weiToGRT(r.signalledTokens), weiToGRT(r.stakedTokens)),
      weiToGRTExact(r.queryFees30d),
      weiToGRTExact(r.queryFeesAmount),
      r.indexerCount,
      r.curatorCount,
      r.createdAt ? new Date(r.createdAt * 1000).toISOString() : null,
    ]),
  );
}

// ---------- saved views ----------

/** A view keeps its columns too, when the table had any chosen. */
export type SavedView = { name: string; query: string; columns?: Record<string, boolean> };

const STORAGE_KEY = 'lodestar:subgraph-views';

/** Storage can be absent or refuse (a private window, blocked site data); a view is a convenience. */
export function loadSavedViews(storage: Pick<Storage, 'getItem'> | undefined): SavedView[] {
  try {
    const raw = storage?.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed)
      ? parsed
          .filter(
            (v): v is SavedView =>
              typeof v === 'object' && v !== null && typeof v.name === 'string' && typeof v.query === 'string',
          )
          .map((v) => {
            const columns = parseColumnChoices(v.columns);
            return Object.keys(columns).length ? { name: v.name, query: v.query, columns } : { name: v.name, query: v.query };
          })
      : [];
  } catch {
    return [];
  }
}

function store(storage: Pick<Storage, 'setItem'> | undefined, views: SavedView[]): SavedView[] {
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify(views));
  } catch {
    // Kept for this visit only.
  }
  return views;
}

/** Saves the state's filters under `name`, replacing a view of the same name. */
export function saveView(
  storage: Pick<Storage, 'getItem' | 'setItem'> | undefined,
  name: string,
  state: DirectoryState,
  columns: Record<string, boolean> = {},
): SavedView[] {
  const trimmed = name.trim();
  if (!trimmed) return loadSavedViews(storage);
  const view: SavedView = { name: trimmed, query: filterParams(state).toString() };
  if (Object.keys(columns).length) view.columns = columns;
  const rest = loadSavedViews(storage).filter((v) => v.name !== trimmed);
  return store(storage, [...rest, view]);
}

export function deleteView(storage: Pick<Storage, 'getItem' | 'setItem'> | undefined, name: string): SavedView[] {
  return store(storage, loadSavedViews(storage).filter((v) => v.name !== name));
}
