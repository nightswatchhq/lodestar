'use client';

import { useState, useMemo, useEffect, useRef, useCallback, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { Card } from '@/components/ui/Card';
import { ChartSkeleton } from '@/components/ui/ChartSkeleton';
import { Badge } from '@/components/ui/Badge';
import { Pagination } from '@/components/ui/Pagination';
import { TableControls } from '@/components/ui/TableControls';
import { useTablePrefs } from '@/hooks/useTablePrefs';
import { isColumnVisible, type ColumnSpec } from '@/lib/table-prefs';
import { ExportButton } from '@/components/ui/ExportButton';
import { useSubgraphDirectory, useNetworkStats } from '@/hooks/useNetworkStats';
import { weiToGRT, formatGRT, cn } from '@/lib/utils';
import { RATIO_TOOLTIP, signalStakeRatio } from '@/lib/allocation-ratio';
import { CopyableId, truncatedQm } from '@/components/ui/CopyableId';
import { WatchStar } from '@/components/ui/WatchStar';
import { fetchSubgraphDirectory, fetchSubgraphSearch, type DirectoryFacet, type DirectoryRow } from '@/lib/api';
import { emptySearchMessage } from '@/lib/search-backlog';
import {
  DIRECTORY_PAGE_SIZE as PAGE_SIZE,
  HIGH_VOLUME_FEES_GRT,
  PRESETS,
  activePreset,
  applyPreset,
  deleteView,
  directoryApiQuery,
  directoryCsv,
  directoryParams,
  emptyDirectoryState,
  fetchWholeDirectory,
  hasFilters,
  isUnallocated,
  loadSavedViews,
  parseDirectoryState,
  saveView,
  toggleUnallocated,
  type Bound,
  type DirectorySortKey,
  type DirectoryState,
  type RangeKey,
  type SavedView,
} from '@/lib/subgraph-directory';

// ---------- per-row cells ----------

const CATEGORY_VARIANT: Record<NonNullable<DirectoryRow['complexity']>, 'success' | 'default' | 'warning' | 'error'> = {
  Light: 'success',
  Moderate: 'default',
  Heavy: 'warning',
  Extreme: 'error',
};

function ComplexityCell({ complexity }: { complexity: DirectoryRow['complexity'] }) {
  if (!complexity) return <span className="text-[var(--text-faint)]">--</span>;
  return <Badge variant={CATEGORY_VARIANT[complexity]}>{complexity}</Badge>;
}

function NetworkCell({ network }: { network: string | null }) {
  if (!network) return <span className="text-[var(--text-faint)]">--</span>;
  return (
    <Badge variant="accent" className="inline-flex items-center gap-1 whitespace-nowrap">
      <span className="truncate max-w-[80px]">{network}</span>
    </Badge>
  );
}

/** Signal over stake, or ∞ where nothing is allocated against the signal. */
function RatioText({ ratio }: { ratio: number | null }) {
  if (ratio === null) return <span title="Nothing allocated against this signal">∞</span>;
  return <>{ratio.toFixed(3)}</>;
}

/**
 * A number the URL holds, edited as text and committed on blur or Enter, so a half-typed "2" is
 * not sent on its way to "200".
 */
function NumberField({
  value,
  onCommit,
  placeholder,
  ariaLabel,
}: {
  value: number | null;
  onCommit: (v: number | null) => void;
  placeholder: string;
  ariaLabel: string;
}) {
  const shown = value === null ? '' : String(value);
  const [text, setText] = useState(shown);
  const [prev, setPrev] = useState(shown);
  if (shown !== prev) {
    setPrev(shown);
    setText(shown);
  }
  const commit = () => {
    const t = text.trim();
    const n = t === '' ? null : Number(t);
    if (n === null || (Number.isFinite(n) && n >= 0)) {
      if (n !== value) onCommit(n);
    } else {
      setText(shown);
    }
  };
  return (
    <input
      type="text"
      inputMode="decimal"
      aria-label={ariaLabel}
      value={text}
      placeholder={placeholder}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit();
      }}
      className={cn(
        'w-full min-w-0 px-2 py-1 text-xs font-mono rounded-[var(--radius-button)]',
        'bg-[var(--bg-surface)] border border-[var(--border)] text-[var(--text)]',
        'placeholder:text-[var(--text-faint)] focus:outline-none focus:border-[var(--accent)]',
      )}
    />
  );
}

function RangeField({
  label,
  bound,
  onChange,
}: {
  label: string;
  bound: Bound;
  onChange: (b: Bound) => void;
}) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] text-[var(--text-faint)] mb-1">{label}</p>
      <div className="flex items-center gap-1">
        <NumberField
          value={bound.min}
          placeholder="min"
          ariaLabel={`${label} minimum`}
          onCommit={(min) => onChange({ ...bound, min })}
        />
        <span className="text-[var(--text-faint)] text-xs">–</span>
        <NumberField
          value={bound.max}
          placeholder="max"
          ariaLabel={`${label} maximum`}
          onCommit={(max) => onChange({ ...bound, max })}
        />
      </div>
    </div>
  );
}

function FacetSelect({
  label,
  allLabel,
  value,
  facets,
  onChange,
}: {
  label: string;
  allLabel: string;
  value: string | null;
  facets: DirectoryFacet[];
  onChange: (v: string | null) => void;
}) {
  // A value from a shared link that the set no longer holds is still shown, so the filter is visible.
  const options = value && !facets.some((f) => f.id === value) ? [{ id: value, count: 0 }, ...facets] : facets;
  return (
    <select
      aria-label={label}
      value={value ?? 'all'}
      onChange={(e) => onChange(e.target.value === 'all' ? null : e.target.value)}
      className={cn(
        'px-3 py-1.5 text-xs rounded-[var(--radius-button)]',
        'bg-[var(--bg-surface)] border border-[var(--border)]',
        'text-[var(--text)]',
        'focus:outline-none focus:border-[var(--accent)]',
      )}
    >
      <option value="all">{allLabel}</option>
      {options.map((f) => (
        <option key={f.id} value={f.id}>
          {f.id} ({f.count.toLocaleString()})
        </option>
      ))}
    </select>
  );
}

function safeStorage(): Storage | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

// ---------- component ----------

interface SearchResult {
  id: string;
  metadata: { displayName: string; description: string | null } | null;
  currentVersion: {
    subgraphDeployment: {
      ipfsHash: string;
      signalledTokens: string;
      stakedTokens: string;
    };
  } | null;
}

type Row = DirectoryRow & {
  signal: number;
  stake: number;
  queryFees: number;
  isHighVolume: boolean;
  ratio: number | null;
};

function toRow(d: DirectoryRow, is30d: boolean): Row {
  const signal = weiToGRT(d.signalledTokens);
  const stake = weiToGRT(d.stakedTokens);
  return {
    ...d,
    signal,
    stake,
    queryFees: weiToGRT(is30d ? d.queryFees30d : d.queryFeesAmount),
    isHighVolume: weiToGRT(d.queryFeesAmount) >= HIGH_VOLUME_FEES_GRT,
    ratio: signalStakeRatio(signal, stake),
  };
}

/** What the column picker offers. Selection, rank and deployment always stay. */
const SUBGRAPH_COLUMNS: readonly ColumnSpec[] = [
  { id: 'complexity', label: 'Complexity' },
  { id: 'network', label: 'Network' },
  { id: 'categories', label: 'Categories', defaultVisible: false },
  { id: 'signal', label: 'Signal' },
  { id: 'stake', label: 'Stake' },
  { id: 'queryFees', label: 'Query Fees' },
  { id: 'created', label: 'Created' },
  { id: 'indexers', label: 'Indexers' },
  { id: 'ratio', label: 'Signal/Stake' },
  { id: 'curators', label: 'Curators' },
];
const SPEC = Object.fromEntries(SUBGRAPH_COLUMNS.map((c) => [c.id, c]));

const RANGE_LABELS: Record<RangeKey, string> = {
  signal: 'Signal (GRT)',
  stake: 'Stake (GRT)',
  ratio: 'Signal/Stake',
  fees: 'Fees (GRT)',
  indexers: 'Indexers',
};

export default function SubgraphDirectoryPage() {
  return (
    <Suspense fallback={<ChartSkeleton height="300px" />}>
      <SubgraphDirectory />
    </Suspense>
  );
}

function SubgraphDirectory() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { data: networkData } = useNetworkStats();
  const networkRatio = (() => {
    const n = networkData?.graphNetwork;
    if (!n?.totalTokensSignalled || !n?.totalTokensAllocated) return 0;
    const stake = weiToGRT(n.totalTokensAllocated);
    return stake > 0 ? weiToGRT(n.totalTokensSignalled) / stake : 0;
  })();

  const state = useMemo(() => parseDirectoryState(searchParams), [searchParams]);
  const [searchQuery, setSearchQuery] = useState(() => searchParams.get('q') ?? '');

  const navigate = useCallback(
    (next: DirectoryState, q: string) => {
      const params = directoryParams(next);
      if (q) params.set('q', q);
      const qs = params.toString();
      router.replace(qs ? `/subgraphs?${qs}` : '/subgraphs', { scroll: false });
    },
    [router],
  );
  /** Any change but a page turn starts again from the first page. */
  const update = (next: DirectoryState) => navigate({ ...next, page: 0 }, searchQuery);
  const setPage = (page: number) => navigate({ ...state, page }, searchQuery);

  const [searchResults, setSearchResults] = useState<SearchResult[] | null>(null);
  // Null until a search has answered: it is the API's own "we have not looked yet", and rendering
  // it as zero would tell a searcher everything is indexed when nobody has checked. kittiwake#8.
  const [warmBacklog, setWarmBacklog] = useState<number | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  /** Set when the search itself failed, which is not the same as it matching nothing. */
  const [searchError, setSearchError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const { columns: columnChoices, density, setColumns, setDensity } = useTablePrefs('subgraphs');
  const show = (id: string) => isColumnVisible(SPEC[id], columnChoices);
  const pad = density === 'compact' ? 'px-3 py-1.5' : 'px-4 py-3';

  const [savedViews, setSavedViews] = useState<SavedView[]>([]);
  const [viewName, setViewName] = useState('');
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage exists only after mount
    setSavedViews(loadSavedViews(safeStorage()));
  }, []);

  // Selected rows are kept whole, so the totals survive a page turn.
  const [selected, setSelected] = useState<Map<string, Row>>(new Map());
  const toggleSelection = useCallback((row: Row) => {
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(row.ipfsHash)) next.delete(row.ipfsHash);
      else next.set(row.ipfsHash, row);
      return next;
    });
  }, []);

  // Debounced search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!searchQuery || searchQuery.length < 2) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- debounced async search — intentional
      setSearchResults(null);
      return;
    }

    setSearchLoading(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const { hits, warmBacklog } = await fetchSubgraphSearch(searchQuery);
        setSearchResults(hits);
        setWarmBacklog(warmBacklog);
        setSearchError(null);
      } catch (e) {
        // The old catch set the results to `[]`, so a search that could not run and a search that
        // matched nothing rendered the same sentence.
        setSearchResults(null);
        setWarmBacklog(null);
        setSearchError(e instanceof Error ? e.message : 'The search could not be run.');
      } finally {
        setSearchLoading(false);
      }
    }, 300);

    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [searchQuery]);

  const is30d = state.window === '30d';
  const { data, isLoading, isError, isFetching } = useSubgraphDirectory(directoryApiQuery(state));
  const rows = useMemo(() => (data?.data ?? []).map((d) => toRow(d, is30d)), [data, is30d]);

  const selectedRows = [...selected.values()];
  const selectionFees = selectedRows.reduce((s, r) => s + r.queryFees, 0);
  const selectionSignal = selectedRows.reduce((s, r) => s + r.signal, 0);
  const selectionStake = selectedRows.reduce((s, r) => s + r.stake, 0);

  const preset = activePreset(state);
  const filtered = hasFilters(state);
  const currentFilters = directoryParams({ ...state, page: 0 }).toString();
  const currentView = savedViews.find((v) => v.query === currentFilters);

  const handleSort = (key: DirectorySortKey) => {
    if (state.sort === key) update({ ...state, dir: state.dir === 'desc' ? 'asc' : 'desc' });
    else update({ ...state, sort: key, dir: 'desc' });
  };
  const setRange = (k: RangeKey, b: Bound) => update({ ...state, ranges: { ...state.ranges, [k]: b } });

  const thBase =
    'px-4 py-3 text-[11px] font-medium text-[var(--text-muted)] select-none border-r border-[var(--border)]/20 last:border-r-0';
  const thSortable = cn(thBase, 'cursor-pointer hover:text-[var(--text)] transition-colors');
  const tdBorder = 'border-r border-[var(--border)]/20 last:border-r-0';

  const renderSortArrow = (key: DirectorySortKey) =>
    state.sort === key ? (
      <span className="text-[var(--accent-text)] ml-1">{state.dir === 'desc' ? '↓' : '↑'}</span>
    ) : null;

  if (isLoading && !data) {
    // Reserves roughly what a full page of results occupies (PAGE_SIZE rows at
    // ~67px, plus header and pagination). At the old 300px the table grew by
    // ~1400px on load and shoved the whole footer down the page.
    return <ChartSkeleton height="1725px" />;
  }

  if (!data) {
    return (
      <div className="text-center py-24">
        <h2 className="text-xl font-semibold text-[var(--text)] mb-2">Unable to Load Deployments</h2>
        <p className="text-[var(--text-muted)]">
          {isError ? 'The deployment directory could not be read.' : 'No deployment data has arrived.'}
        </p>
      </div>
    );
  }

  const isSearching = searchQuery.length >= 2;
  const total = data.total;
  const labelFilter = state.network !== null || state.complexity !== null;
  const buttonBase = 'px-3 py-1.5 text-xs font-medium rounded-[var(--radius-button)] border transition-colors';
  const buttonOn = 'bg-[var(--accent)] text-white border-[var(--accent)]';
  const buttonOff = 'bg-[var(--bg-surface)] text-[var(--text-muted)] border-[var(--border)] hover:border-[var(--accent)]';

  const highVolumeBadge = (
    <span className="relative group/elite shrink-0">
      <Badge
        variant="warning"
        className="cursor-pointer whitespace-nowrap"
        onClick={(e) => { e.preventDefault(); update(applyPreset('high-volume')); }}
      >
        High volume
      </Badge>
      <span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2 py-1 text-[10px] text-white bg-[var(--bg-elevated)] border border-[var(--border)] rounded whitespace-nowrap opacity-0 group-hover/elite:opacity-100 transition-opacity z-50">
        Earned over {HIGH_VOLUME_FEES_GRT.toLocaleString()} GRT in query fees
      </span>
    </span>
  );

  return (
    <div className="space-y-6">
      {/* Search bar */}
      <div>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => {
            setSearchQuery(e.target.value);
            navigate(state, e.target.value);
          }}
          placeholder="Search by name, Qm hash, or contract address (0x…)"
          className={cn(
            'w-full px-4 py-3 text-sm rounded-[var(--radius-card)]',
            'bg-[var(--bg-surface)] border border-[var(--border)]',
            'text-[var(--text)] placeholder:text-[var(--text-faint)]',
            'focus:outline-none focus:border-[var(--accent)]',
          )}
        />
      </div>

      {/* Window, presets and saved views */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-[var(--radius-button)] border border-[var(--border)] overflow-hidden">
          {(['30d', 'allTime'] as const).map((w) => (
            <button
              key={w}
              onClick={() => update({ ...state, window: w })}
              className={cn(
                'px-3 py-1.5 text-xs font-medium transition-colors',
                state.window === w
                  ? 'bg-[var(--accent)] text-white'
                  : 'bg-[var(--bg-surface)] text-[var(--text-muted)] hover:text-[var(--text)]'
              )}
            >
              {w === '30d' ? '30 Day Fees' : 'All Time'}
            </button>
          ))}
        </div>
        {PRESETS.map((p) => (
          <button
            key={p.id}
            title={p.title}
            onClick={() => update(preset === p.id ? emptyDirectoryState() : applyPreset(p.id))}
            className={cn(buttonBase, preset === p.id ? buttonOn : buttonOff)}
          >
            {p.label}
          </button>
        ))}
        <Link
          href="/subgraphs/migration"
          title="BNB and Polygon deployments with signal and no indexer, for the move off Subgraph Studio"
          className="text-xs text-[var(--text-muted)] hover:text-[var(--accent-text)] transition-colors"
        >
          Studio migration &rarr;
        </Link>
        {savedViews.length > 0 && (
          <select
            aria-label="Saved views"
            value={currentView?.name ?? ''}
            onChange={(e) => {
              const view = savedViews.find((v) => v.name === e.target.value);
              if (!view) return;
              if (view.columns) setColumns(view.columns);
              navigate(parseDirectoryState(new URLSearchParams(view.query)), searchQuery);
            }}
            className={cn(
              'px-3 py-1.5 text-xs rounded-[var(--radius-button)]',
              'bg-[var(--bg-surface)] border border-[var(--border)] text-[var(--text)]',
              'focus:outline-none focus:border-[var(--accent)]',
            )}
          >
            <option value="" disabled>Saved views</option>
            {savedViews.map((v) => (
              <option key={v.name} value={v.name}>{v.name}</option>
            ))}
          </select>
        )}
        {currentView ? (
          <button
            onClick={() => setSavedViews(deleteView(safeStorage(), currentView.name))}
            className="text-xs text-[var(--text-faint)] hover:text-[var(--text)] transition-colors"
          >
            Forget &ldquo;{currentView.name}&rdquo;
          </button>
        ) : (
          filtered && (
            <form
              className="inline-flex items-center gap-1.5"
              onSubmit={(e) => {
                e.preventDefault();
                if (!viewName.trim()) return;
                setSavedViews(saveView(safeStorage(), viewName, state, columnChoices));
                setViewName('');
              }}
            >
              <input
                type="text"
                aria-label="Name for this view"
                value={viewName}
                onChange={(e) => setViewName(e.target.value)}
                placeholder="Name this view"
                maxLength={40}
                className={cn(
                  'w-32 px-2 py-1.5 text-xs rounded-[var(--radius-button)]',
                  'bg-[var(--bg-surface)] border border-[var(--border)] text-[var(--text)]',
                  'placeholder:text-[var(--text-faint)] focus:outline-none focus:border-[var(--accent)]',
                )}
              />
              <button type="submit" className={cn(buttonBase, buttonOff)}>Save</button>
            </form>
          )
        )}
      </div>

      {/* Filters */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <FacetSelect
            label="Filter by network"
            allLabel="All Networks"
            value={state.network}
            facets={data.facets.networks}
            onChange={(network) => update({ ...state, network })}
          />
          <button
            title="Some curation signal and no open allocation; combines with the network filter"
            aria-pressed={isUnallocated(state)}
            onClick={() => update(toggleUnallocated(state))}
            className={cn(buttonBase, isUnallocated(state) ? buttonOn : buttonOff)}
          >
            Signalled, nobody allocated
          </button>
          <FacetSelect
            label="Filter by complexity"
            allLabel="All Complexities"
            value={state.complexity}
            facets={data.facets.complexities}
            onChange={(complexity) => update({ ...state, complexity })}
          />
          {(data.facets.categories.length > 0 || state.category) && (
            <FacetSelect
              label="Filter by category"
              allLabel="All Categories"
              value={state.category}
              facets={data.facets.categories}
              onChange={(category) => update({ ...state, category })}
            />
          )}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {(['signal', 'stake', 'ratio', 'fees', 'indexers'] as const).map((k) => (
            <RangeField
              key={k}
              label={k === 'fees' ? `Fees ${is30d ? '30d' : 'all time'} (GRT)` : RANGE_LABELS[k]}
              bound={state.ranges[k]}
              onChange={(b) => setRange(k, b)}
            />
          ))}
          <div className="min-w-0">
            <p className="text-[10px] text-[var(--text-faint)] mb-1">Created within (days)</p>
            <NumberField
              value={state.createdWithinDays}
              placeholder="any"
              ariaLabel="Created within days"
              onCommit={(d) => update({ ...state, createdWithinDays: d === null || d < 1 ? null : Math.floor(d) })}
            />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--text-muted)]">
          <span className={cn('font-mono', isFetching && 'opacity-60')}>
            {total.toLocaleString()} {total === 1 ? 'deployment' : 'deployments'}
          </span>
          {labelFilter && data.unanalysed > 0 && (
            <span className="text-[var(--text-faint)]">
              {data.unanalysed.toLocaleString()} whose manifest has not been read yet cannot match a network or complexity filter.
            </span>
          )}
          {filtered && (
            <button
              onClick={() => update({ ...emptyDirectoryState(), window: state.window, sort: state.sort, dir: state.dir })}
              className="text-[var(--text-faint)] hover:text-[var(--text)] transition-colors"
            >
              Clear filters
            </button>
          )}
          <span className="ml-auto flex items-center gap-2">
            <ExportButton
              compact
              label={`Export CSV (${total.toLocaleString()})`}
              filename={filtered ? 'subgraphs-filtered' : 'subgraphs'}
              disabled={total === 0}
              title="Every deployment matching these filters, not just this page"
              onExport={async () => directoryCsv(await fetchWholeDirectory(state, fetchSubgraphDirectory))}
            />
            <TableControls
              className="hidden md:flex"
              specs={SUBGRAPH_COLUMNS}
              columns={columnChoices}
              onColumnsChange={setColumns}
              density={density}
              onDensityChange={setDensity}
            />
          </span>
        </div>
      </div>

      {/* Selection summary bar */}
      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-4 py-2.5 bg-[var(--accent)]/10 border border-[var(--accent)]/30 rounded-[var(--radius-card)] text-sm">
          <span className="font-medium text-[var(--accent-text)]">{selected.size} selected</span>
          <span className="text-[var(--border-mid)]">·</span>
          <span className="text-[var(--text-muted)] font-mono">{formatGRT(selectionFees)} GRT {is30d ? '30d fees' : 'fees'}</span>
          <span className="text-[var(--border-mid)]">·</span>
          <span className="text-[var(--text-muted)] font-mono">{formatGRT(selectionSignal)} signal</span>
          <span className="text-[var(--border-mid)]">·</span>
          <span className="text-[var(--text-muted)] font-mono">{formatGRT(selectionStake)} stake</span>
          <button
            onClick={() => setSelected(new Map())}
            className="ml-auto text-xs text-[var(--text-faint)] hover:text-[var(--text)] transition-colors"
          >
            Clear
          </button>
        </div>
      )}

      {/* Search results */}
      {isSearching && (
        <Card className="overflow-hidden">
          {searchLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="w-6 h-6 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
            </div>
          ) : searchError ? (
            <p className="px-4 py-8 text-center text-sm text-[var(--text-muted)]">{searchError}</p>
          ) : searchResults && searchResults.length > 0 ? (
            <div className="divide-y divide-[var(--border)]">
              {searchResults.map((s) => {
                const dep = s.currentVersion?.subgraphDeployment;
                if (!dep) return null;
                const signal = weiToGRT(dep.signalledTokens);
                const stake = weiToGRT(dep.stakedTokens);
                return (
                  <Link
                    key={s.id}
                    href={`/subgraphs/${dep.ipfsHash}`}
                    className="flex items-center justify-between px-4 py-3 hover:bg-[var(--bg-elevated)] transition-colors"
                  >
                    <div>
                      <p className="text-sm font-medium text-[var(--text)]">
                        {s.metadata?.displayName || 'Unnamed'}
                      </p>
                      <CopyableId
                        value={dep.ipfsHash}
                        title="Copy hash"
                        display={truncatedQm(dep.ipfsHash)}
                        className="text-xs text-[var(--text-faint)]"
                      />
                    </div>
                    <div className="flex items-center gap-4 text-xs font-mono text-[var(--text-muted)]">
                      <span>{formatGRT(signal)} signal</span>
                      <span>{formatGRT(stake)} stake</span>
                    </div>
                  </Link>
                );
              })}
            </div>
          ) : (
            <p className="px-4 py-8 text-sm text-[var(--text-faint)] text-center">
              {emptySearchMessage(searchQuery, warmBacklog)}
            </p>
          )}
        </Card>
      )}

      {rows.length === 0 && (
        <Card>
          <p className="px-4 py-8 text-sm text-[var(--text-faint)] text-center">
            {filtered ? 'No deployment matches these filters.' : 'No deployments on this page.'}
          </p>
        </Card>
      )}

      {/* Mobile cards */}
      <div className="block md:hidden space-y-3">
        {rows.map((row, idx) => {
          const highRatio = row.ratio === null || (networkRatio > 0 && row.ratio >= networkRatio);
          const isSelected = selected.has(row.ipfsHash);
          return (
            <Link key={row.id} href={`/subgraphs/${row.ipfsHash}`} className="block relative">
              <Card className={`transition-colors ${isSelected ? 'border-[var(--accent)]/50 bg-[var(--accent)]/5' : 'hover:border-[var(--accent-hover)]'}`}>
                <button
                  aria-label="Select subgraph"
                  className={`absolute top-2.5 right-2.5 z-10 w-6 h-6 rounded border-2 flex items-center justify-center transition-colors ${
                    isSelected
                      ? 'border-[var(--accent)] bg-[var(--accent)]'
                      : 'border-[var(--border-mid)] bg-[var(--bg-surface)]'
                  }`}
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggleSelection(row); }}
                >
                  {isSelected && (
                    <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 12 12">
                      <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </button>
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1 min-w-0 mr-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-[var(--text-faint)]">#{state.page * PAGE_SIZE + idx + 1}</span>
                      {row.displayName ? (
                        <span className="text-sm font-medium text-[var(--text)] truncate" title={row.displayName}>
                          {row.displayName}
                        </span>
                      ) : (
                        <CopyableId
                          value={row.ipfsHash}
                          title="Copy hash"
                          display={truncatedQm(row.ipfsHash)}
                          className="font-mono text-sm text-[var(--text)]"
                        />
                      )}
                      {row.isHighVolume && highVolumeBadge}
                    </div>
                    {row.displayName ? (
                      <CopyableId
                        value={row.ipfsHash}
                        title="Copy hash"
                        display={truncatedQm(row.ipfsHash)}
                        className="text-[10px] text-[var(--text-faint)] mt-0.5 ml-7"
                      />
                    ) : null}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <WatchStar kind="subgraph" id={row.ipfsHash} />
                    <ComplexityCell complexity={row.complexity} />
                    <NetworkCell network={row.network} />
                    {row.indexerCount <= 1 && (
                      <span className="relative group/lowidx">
                        <Badge variant="warning" className="text-[10px] px-1.5">{row.indexerCount} idx</Badge>
                        <span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2 py-1 text-[10px] text-white bg-[var(--bg-elevated)] border border-[var(--border)] rounded whitespace-nowrap opacity-0 group-hover/lowidx:opacity-100 transition-opacity z-50">
                          Only {row.indexerCount} active indexer, so it may be hard to sync
                        </span>
                      </span>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="p-2 rounded bg-[var(--bg-elevated)]">
                    <p className="text-[10px] text-[var(--text-faint)]">Signal</p>
                    <p className="text-xs font-mono text-[var(--text)]">{formatGRT(row.signal)}</p>
                  </div>
                  <div className="p-2 rounded bg-[var(--bg-elevated)]">
                    <p className="text-[10px] text-[var(--text-faint)]">Stake</p>
                    <p className="text-xs font-mono text-[var(--text)]">{formatGRT(row.stake)}</p>
                  </div>
                  <div className="p-2 rounded bg-[var(--bg-elevated)]">
                    <p className="text-[10px] text-[var(--text-faint)]">Sig/Stake</p>
                    <p className={cn('text-xs font-mono', highRatio ? 'text-[var(--green)] font-semibold' : 'text-[var(--text)]')}>
                      <RatioText ratio={row.ratio} />
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center mt-2">
                  <div className="p-2 rounded bg-[var(--bg-elevated)]">
                    <p className="text-[10px] text-[var(--text-faint)]">{is30d ? 'Fees 30d' : 'Fees'}</p>
                    <p className="text-xs font-mono text-[var(--text)]">{formatGRT(row.queryFees)}</p>
                  </div>
                  <div className="p-2 rounded bg-[var(--bg-elevated)]">
                    <p className="text-[10px] text-[var(--text-faint)]">Indexers</p>
                    <p className="text-xs font-mono text-[var(--text)]">{row.indexerCount}</p>
                  </div>
                  <div className="p-2 rounded bg-[var(--bg-elevated)]">
                    <p className="text-[10px] text-[var(--text-faint)]">Curators</p>
                    <p className="text-xs font-mono text-[var(--text)]">{row.curatorCount}</p>
                  </div>
                </div>
              </Card>
            </Link>
          );
        })}
        {total > 0 && (
          <Pagination page={state.page} pageSize={PAGE_SIZE} totalItems={total} onPageChange={setPage} />
        )}
      </div>

      {/* Desktop table */}
      <Card className={cn('overflow-hidden hidden', rows.length > 0 && 'md:block')}>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-[var(--bg-elevated)]">
              <tr>
                <th className={cn(thBase, 'w-10 text-center')}>
                  <input
                    aria-label="Select all subgraphs"
                    type="checkbox"
                    className="cursor-pointer accent-[var(--accent)]"
                    checked={rows.length > 0 && rows.every((r) => selected.has(r.ipfsHash))}
                    onChange={(e) => {
                      setSelected((prev) => {
                        const next = new Map(prev);
                        for (const r of rows) {
                          if (e.target.checked) next.set(r.ipfsHash, r);
                          else next.delete(r.ipfsHash);
                        }
                        return next;
                      });
                    }}
                  />
                </th>
                <th className={cn(thBase, 'text-left w-12')}>#</th>
                <th className={cn(thBase, 'text-left')}>Deployment ID</th>
                {show('complexity') && <th className={cn(thBase, 'text-center')}>Complexity</th>}
                {show('network') && <th className={cn(thBase, 'text-center')}>Network</th>}
                {show('categories') && <th className={cn(thBase, 'text-left')}>Categories</th>}
                {show('signal') && (
                  <th className={cn(thSortable, 'text-right')} onClick={() => handleSort('signal')}>
                    Signal (GRT){renderSortArrow('signal')}
                  </th>
                )}
                {show('stake') && (
                  <th className={cn(thSortable, 'text-right')} onClick={() => handleSort('stake')}>
                    Stake (GRT){renderSortArrow('stake')}
                  </th>
                )}
                {show('queryFees') && (
                  <th className={cn(thSortable, 'text-right')} onClick={() => handleSort('queryFees')}>
                    {is30d ? 'Fees 30d (GRT)' : 'Query Fees (GRT)'}{renderSortArrow('queryFees')}
                  </th>
                )}
                {show('created') && (
                  <th className={cn(thSortable, 'text-right')} onClick={() => handleSort('created')}>
                    Created{renderSortArrow('created')}
                  </th>
                )}
                {show('indexers') && (
                  <th className={cn(thSortable, 'text-right')} onClick={() => handleSort('indexers')}>
                    Indexers{renderSortArrow('indexers')}
                  </th>
                )}
                {show('ratio') && (
                  <th className={cn(thSortable, 'text-right')} title={RATIO_TOOLTIP} onClick={() => handleSort('ratio')}>
                    Signal/Stake{renderSortArrow('ratio')}
                  </th>
                )}
                {show('curators') && (
                  <th className={cn(thSortable, 'text-right')} onClick={() => handleSort('curators')}>
                    Curators{renderSortArrow('curators')}
                  </th>
                )}
              </tr>
            </thead>
            <tbody className={cn(isFetching && 'opacity-60 transition-opacity')}>
              {rows.map((row, idx) => {
                const highRatio = row.ratio === null || (networkRatio > 0 && row.ratio >= networkRatio);
                const isSelected = selected.has(row.ipfsHash);
                return (
                  <tr
                    key={row.id}
                    className={`border-b border-[0.5px] border-[var(--border)] transition-colors ${isSelected ? 'bg-[var(--accent)]/5' : 'hover:bg-[var(--bg-elevated)]'}`}
                  >
                    <td
                      className={cn(density === 'compact' ? 'px-3 py-1.5' : 'px-3 py-3', 'text-center', tdBorder)}
                      onClick={(e) => { e.stopPropagation(); toggleSelection(row); }}
                    >
                      <input
                        aria-label="Select subgraph"
                        type="checkbox"
                        className="cursor-pointer accent-[var(--accent)]"
                        checked={isSelected}
                        onChange={() => {}}
                      />
                    </td>
                    <td className={cn(pad, 'text-sm text-[var(--text-faint)]', tdBorder)}>{state.page * PAGE_SIZE + idx + 1}</td>
                    <td className={cn(pad, tdBorder)}>
                      <div className="flex items-center gap-2">
                        <WatchStar kind="subgraph" id={row.ipfsHash} className="-ml-1" />
                        <div className="flex flex-col min-w-0">
                          <Link
                            href={`/subgraphs/${row.ipfsHash}`}
                            className="hover:text-[var(--accent-text)] transition-colors text-sm font-medium text-[var(--text)] truncate max-w-[220px]"
                          >
                            {row.displayName ?? truncatedQm(row.ipfsHash)}
                          </Link>
                          <CopyableId
                            value={row.ipfsHash}
                            title="Copy hash"
                            display={truncatedQm(row.ipfsHash)}
                            className="text-[10px] text-[var(--text-faint)]"
                          />
                        </div>
                        {row.isHighVolume ? highVolumeBadge : null}
                      </div>
                    </td>
                    {show('complexity') && (
                      <td className={cn(pad, 'text-center', tdBorder)}>
                        <ComplexityCell complexity={row.complexity} />
                      </td>
                    )}
                    {show('network') && (
                      <td className={cn(pad, 'text-center', tdBorder)}>
                        <NetworkCell network={row.network} />
                      </td>
                    )}
                    {show('categories') && (
                      <td className={cn(pad, 'text-xs text-[var(--text-muted)]', tdBorder)}>
                        {row.categories.length ? row.categories.join(', ') : <span className="text-[var(--text-faint)]">--</span>}
                      </td>
                    )}
                    {show('signal') && (
                      <td className={cn(pad, 'text-right font-mono text-sm text-[var(--text)]', tdBorder)}>
                        {formatGRT(row.signal)}
                      </td>
                    )}
                    {show('stake') && (
                      <td className={cn(pad, 'text-right font-mono text-sm text-[var(--text)]', tdBorder)}>
                        {formatGRT(row.stake)}
                      </td>
                    )}
                    {show('queryFees') && (
                      <td className={cn(pad, 'text-right font-mono text-sm text-[var(--text)]', tdBorder)}>
                        {formatGRT(row.queryFees)}
                      </td>
                    )}
                    {show('created') && (
                      <td className={cn(pad, 'text-right font-mono text-sm text-[var(--text-muted)]', tdBorder)}>
                        {row.createdAt ? new Date(row.createdAt * 1000).toLocaleDateString() : '--'}
                      </td>
                    )}
                    {show('indexers') && (
                      <td className={cn(pad, 'text-right font-mono text-sm text-[var(--text)]', tdBorder)}>
                        <span className="inline-flex items-center justify-end gap-1.5">
                          {row.indexerCount}
                          {row.indexerCount <= 1 && (
                            <span className="relative group/lowidx">
                              <span className="text-[var(--amber)] text-xs cursor-default">&#9888;</span>
                              <span className="pointer-events-none absolute bottom-full right-0 mb-1.5 px-2 py-1 text-[10px] text-white bg-[var(--bg-elevated)] border border-[var(--border)] rounded whitespace-nowrap opacity-0 group-hover/lowidx:opacity-100 transition-opacity z-50">
                                Only {row.indexerCount} active indexer, so it may be hard to sync
                              </span>
                            </span>
                          )}
                        </span>
                      </td>
                    )}
                    {show('ratio') && (
                      <td
                        className={cn(
                          pad,
                          'text-right font-mono text-sm',
                          tdBorder,
                          highRatio ? 'text-[var(--green)] font-semibold' : 'text-[var(--text)]'
                        )}
                      >
                        <RatioText ratio={row.ratio} />
                      </td>
                    )}
                    {show('curators') && (
                      <td className={cn(pad, 'text-right font-mono text-sm text-[var(--text)]', tdBorder)}>
                        {row.curatorCount}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <Pagination page={state.page} pageSize={PAGE_SIZE} totalItems={total} onPageChange={setPage} />
      </Card>
    </div>
  );
}
