'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useEnrichedIndexers } from '@/hooks/useNetworkStats';
import { isUnavailable, unavailableReason, useQueryState } from '@/hooks/useQueryState';
import { fetchENSAddress, fetchSubgraphSearch } from '@/lib/api';
import { loadSavedViews } from '@/lib/subgraph-directory';
import { emptySearchMessage } from '@/lib/search-backlog';
import { navigation } from './Sidebar';
import { accountHits, actionHits, deploymentHashHit, indexerHits, isEnsName, pageHits, subgraphHits, subgraphSearchable, type OmniHit, type OmniKind } from '@/lib/omni-search';
import { cn } from '@/lib/utils';

const PAGES = navigation.flatMap((s) => s.items.map(({ label, href }) => ({ label, href })));

/** Saved subgraph views live in this browser only; storage may be absent or refuse. */
function savedViews() {
  try {
    return loadSavedViews(window.localStorage);
  } catch {
    return [];
  }
}

const GROUPS: { kind: OmniKind; title: string }[] = [
  { kind: 'action', title: 'Actions' },
  { kind: 'page', title: 'Pages' },
  { kind: 'indexer', title: 'Indexers' },
  { kind: 'subgraph', title: 'Subgraphs' },
  { kind: 'account', title: 'Address' },
];

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
    </svg>
  );
}

export function OmniSearch() {
  const router = useRouter();
  const pathname = usePathname();
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState('');
  const [debounced, setDebounced] = useState('');
  const [open, setOpen] = useState(false);
  const [touched, setTouched] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  // By link, not by row: late subgraph results insert rows above the address ones.
  const [activeHref, setActiveHref] = useState<string | null>(null);

  useEffect(() => {
    const id = setTimeout(() => setDebounced(value.trim()), 250);
    return () => clearTimeout(id);
  }, [value]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const typing = target?.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target?.tagName ?? '');
      if ((e.key === 'k' && (e.metaKey || e.ctrlKey)) || (e.key === '/' && !typing)) {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const indexersQuery = useEnrichedIndexers(touched);
  const indexersState = useQueryState(indexersQuery);
  const searchQuery = useQuery({
    queryKey: ['subgraph-search', debounced],
    enabled: subgraphSearchable(debounced),
    staleTime: 5 * 60 * 1000,
    queryFn: () => fetchSubgraphSearch(debounced),
  });
  const searchState = useQueryState(searchQuery);
  const ensQuery = useQuery({
    queryKey: ['ens-forward', debounced.toLowerCase()],
    enabled: isEnsName(debounced),
    staleTime: 60 * 60 * 1000,
    retry: false,
    queryFn: () => fetchENSAddress(debounced.toLowerCase()),
  });
  const ensState = useQueryState(ensQuery);
  const ensAddress = ensState.kind === 'ready' && debounced === value.trim() ? ensState.data.address : null;
  const answer = searchState.kind === 'ready' ? searchState.data : undefined;

  const hits = useMemo<OmniHit[]>(() => {
    const q = value.trim();
    if (q.length < 2) return [];
    // The subgraph answer is for the debounced query, so it is only shown while that still matches.
    const subgraphs = debounced === q ? subgraphHits(answer?.hits ?? []) : [];
    const indexers = indexersQuery.data?.indexers ?? [];
    const ens = ensAddress ? [...indexerHits(indexers, ensAddress), ...accountHits(ensAddress)] : [];
    const found = [
      ...actionHits(pathname, q, savedViews()),
      ...pageHits(PAGES, q),
      ...indexerHits(indexers, q),
      ...[deploymentHashHit(q)].filter((hit): hit is OmniHit => hit !== null),
      ...subgraphs,
      ...accountHits(q),
      ...ens,
    ];
    // An ENS name can match an indexer both by its name and by the address it resolves to.
    return found.filter((h, i) => found.findIndex((o) => o.href === h.href && o.copy === h.copy) === i);
  }, [value, debounced, answer, indexersQuery.data, ensAddress, pathname]);

  const q = value.trim();
  const show = open && q.length >= 1;
  const active = Math.max(0, hits.findIndex((h) => h.href === activeHref));
  const subgraphsPending = subgraphSearchable(q) && (debounced !== q || searchQuery.isFetching);
  const searching = subgraphsPending || indexersState.kind === 'loading' || (isEnsName(q) && (debounced !== q || ensState.kind === 'loading'));

  function close() {
    setOpen(false);
    setMobileOpen(false);
    inputRef.current?.blur();
  }

  function go(hit: OmniHit) {
    if (hit.copy) {
      navigator.clipboard?.writeText(hit.copy).catch(() => {
        // Refused by the browser (no permission, insecure context). The address is still in the
        // URL bar, and a dropdown that has just closed has nowhere to say so.
      });
    } else {
      router.push(hit.href);
    }
    setValue('');
    close();
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveHref(hits[Math.min(active + 1, hits.length - 1)]?.href ?? null);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveHref(hits[Math.max(active - 1, 0)]?.href ?? null);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (hits[active]) go(hits[active]);
    } else if (e.key === 'Escape') {
      close();
    }
  }

  let status: string | null = null;
  if (q.length < 2) status = 'Keep typing…';
  else if (hits.length === 0) {
    if (searching) status = 'Searching…';
    else if (isUnavailable(indexersState)) status = `Indexers could not be searched: ${unavailableReason(indexersState)}`;
    else if (isUnavailable(searchState)) status = unavailableReason(searchState) ?? null;
    else if (isEnsName(q) && isUnavailable(ensState)) status = `ENS names cannot be looked up right now, so “${q}” was not resolved.`;
    else if (subgraphSearchable(q)) status = emptySearchMessage(q, answer?.warmBacklog, 'pages, indexers or subgraphs');
    else status = `No pages or indexers found for “${q}”. A full 0x address or Qm… hash also searches subgraphs.`;
  }

  return (
    <>
      <button
        type="button"
        aria-label="Search"
        aria-expanded={mobileOpen}
        aria-controls="omni-search-bar"
        onClick={() => {
          setMobileOpen(true);
          setTimeout(() => inputRef.current?.focus(), 0);
        }}
        className="md:hidden p-1.5 text-[var(--text-muted)]"
      >
        <SearchIcon className="w-4 h-4" />
      </button>

      <div
        id="omni-search-bar"
        className={cn(
          'gap-3 md:relative md:flex md:flex-1 md:max-w-md',
          mobileOpen
            ? 'absolute inset-x-0 top-[var(--safe-top)] h-[var(--topbar-height)] px-4 flex items-center bg-[var(--bg)] z-40 md:inset-auto md:h-auto md:px-0 md:bg-transparent'
            : 'hidden',
        )}
      >
        <div className="relative w-full">
          <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-[var(--text-faint)] pointer-events-none" />
          <input
            ref={inputRef}
            type="text"
            role="combobox"
            aria-expanded={show}
            aria-controls="omni-search-results"
            aria-activedescendant={show && hits[active] ? `omni-hit-${active}` : undefined}
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setActiveHref(null);
              setOpen(true);
            }}
            onFocus={() => {
              setTouched(true);
              setOpen(true);
            }}
            onBlur={() => setTimeout(() => {
              setOpen(false);
              setMobileOpen(false);
            }, 150)}
            onKeyDown={onKeyDown}
            placeholder="Search pages, indexers, subgraphs, 0x… or Qm…"
            spellCheck={false}
            autoComplete="off"
            className="w-full pl-7 pr-10 py-1.5 text-[12px] text-[var(--text)] placeholder-[var(--text-faint)] bg-[var(--bg-surface)] border-[0.5px] border-[var(--border)] rounded-[var(--radius-button)] outline-none focus:border-[var(--border-mid)] transition-colors"
          />
          <kbd className="hidden md:block absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-mono text-[var(--text-faint)] pointer-events-none">
            ⌘K
          </kbd>

          {show && (
            <div
              id="omni-search-results"
              role="listbox"
              className="absolute left-0 right-0 mt-1.5 max-h-[70dvh] overflow-y-auto rounded-[var(--radius-card)] bg-[var(--bg-surface)] border-[0.5px] border-[var(--border)] shadow-[var(--shadow-float)] z-50"
            >
              {GROUPS.map(({ kind, title }) => {
                const group = hits.map((h, i) => ({ h, i })).filter(({ h }) => h.kind === kind);
                if (group.length === 0) return null;
                return (
                  <div key={kind} className="py-1">
                    <p className="px-3.5 pt-1.5 pb-1 text-[10px] uppercase tracking-wide text-[var(--text-faint)]">{title}</p>
                    {group.map(({ h, i }) => (
                      <button
                        key={`${h.href}${h.copy ?? ''}`}
                        id={`omni-hit-${i}`}
                        role="option"
                        aria-selected={i === active}
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onMouseEnter={() => setActiveHref(h.href)}
                        onClick={() => go(h)}
                        className={cn(
                          'w-full flex items-center justify-between gap-3 px-3.5 py-2 text-left text-[13px] transition-colors',
                          i === active ? 'bg-[var(--bg-elevated)]' : 'hover:bg-[var(--bg-elevated)]',
                        )}
                      >
                        <span className="truncate text-[var(--text)]">{h.label}</span>
                        <span className="shrink-0 text-[11px] font-mono text-[var(--text-faint)]">{h.detail}</span>
                      </button>
                    ))}
                  </div>
                );
              })}
              {hits.length > 0 && subgraphsPending && !hits.some((h) => h.kind === 'subgraph') && (
                <p className="px-3.5 py-2 text-[11px] text-[var(--text-faint)] border-t-[0.5px] border-[var(--border)]">Searching subgraphs…</p>
              )}
              {status && <p className="px-3.5 py-2.5 text-[12px] text-[var(--text-faint)]">{status}</p>}
            </div>
          )}
        </div>
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={close}
          className="md:hidden shrink-0 text-[13px] text-[var(--text-muted)]"
        >
          Cancel
        </button>
      </div>
    </>
  );
}
