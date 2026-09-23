/**
 * The indexer directory's sort, search and minimum self-stake, as they live in the URL.
 * Defaults are left out, so `/indexers` with no query is the directory as it always opened.
 */

export const MIN_STAKE_OPTIONS = [0, 100_000, 500_000, 1_000_000, 5_000_000, 10_000_000] as const;

export const INDEXER_SORT_KEYS = [
  'name', 'score', 'foghornGrade', 'qScore', 'selfStake', 'delegated', 'capacity', 'rewardCut',
  'queryCut', 'apr', 'rollingAPY30d', 'rollingAPY90d', 'feesCollected', 'rewards', 'allocated',
  'allocations',
] as const;
export type IndexerSortKey = (typeof INDEXER_SORT_KEYS)[number];

export type IndexerDirectoryState = {
  /** Null when the reader has cleared the sort, which the table allows. */
  sort: { id: IndexerSortKey; desc: boolean } | null;
  q: string;
  minStake: number;
};

export const DEFAULT_INDEXER_DIRECTORY: IndexerDirectoryState = {
  sort: { id: 'score', desc: true },
  q: '',
  minStake: 100_000,
};

export function parseIndexerDirectoryState(params: URLSearchParams): IndexerDirectoryState {
  const state: IndexerDirectoryState = { ...DEFAULT_INDEXER_DIRECTORY };
  const sort = params.get('sort');
  if (sort === 'none') {
    state.sort = null;
  } else if (sort && (INDEXER_SORT_KEYS as readonly string[]).includes(sort)) {
    state.sort = { id: sort as IndexerSortKey, desc: params.get('dir') !== 'asc' };
  } else if (params.get('dir') === 'asc') {
    state.sort = { ...DEFAULT_INDEXER_DIRECTORY.sort!, desc: false };
  }
  state.q = params.get('q') ?? '';
  const min = Number(params.get('minStake'));
  if (params.has('minStake') && (MIN_STAKE_OPTIONS as readonly number[]).includes(min)) state.minStake = min;
  return state;
}

/** Writes the directory's keys onto `params`, deleting defaults so the URL stays short. */
export function applyIndexerDirectoryState(params: URLSearchParams, state: IndexerDirectoryState): void {
  const def = DEFAULT_INDEXER_DIRECTORY.sort!;
  params.delete('sort');
  params.delete('dir');
  if (state.sort === null) {
    params.set('sort', 'none');
  } else {
    if (state.sort.id !== def.id) params.set('sort', state.sort.id);
    if (!state.sort.desc) params.set('dir', 'asc');
  }

  if (state.q) params.set('q', state.q);
  else params.delete('q');

  if (state.minStake === DEFAULT_INDEXER_DIRECTORY.minStake) params.delete('minStake');
  else params.set('minStake', String(state.minStake));
}
