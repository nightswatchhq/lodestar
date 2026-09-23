/**
 * The topbar search: one box for an indexer, a subgraph or an address.
 *
 * Subgraphs are matched server-side by `/api/subgraph-search`, which already reads the shape of the
 * query (a full `0x` address searches manifests, `Qm…` searches hashes, anything else names).
 * Indexers are few enough to match here, against the enriched list the directory already loads.
 */

import type { SubgraphSearchResult } from '@/lib/contracts/subgraph-search';
import { shortenAddress } from '@/lib/utils';

export type OmniKind = 'page' | 'indexer' | 'subgraph' | 'account';

export interface OmniHit {
  kind: OmniKind;
  label: string;
  detail: string;
  href: string;
}

export interface IndexerLike {
  id: string;
  name: string | null;
  ensName: string | null;
}

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;
const PARTIAL_HEX_RE = /^0x[0-9a-fA-F]*$/;

export const isAddress = (q: string) => ADDRESS_RE.test(q.trim());

export interface PageLike {
  label: string;
  href: string;
}

/** Words people search for that a page's label does not use. */
const PAGE_KEYWORDS: Record<string, string> = {
  '/qos': 'qos quality of service',
  '/poi': 'proof of indexing',
  '/network': 'health stats',
  '/foghorn': 'alerts',
};

/** Pages whose label, path or keywords match, label prefixes first. */
export function pageHits(pages: readonly PageLike[], q: string, limit = 4): OmniHit[] {
  const t = q.trim().toLowerCase();
  if (t.length < 2) return [];
  return pages
    .map((p) => {
      const label = p.label.toLowerCase();
      const path = p.href.slice(1).replace(/-/g, ' ');
      const words = `${path} ${PAGE_KEYWORDS[p.href] ?? ''}`;
      const score = label.startsWith(t) ? 2 : label.includes(t) || words.includes(t) ? 1 : 0;
      return { p, score };
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ p }) => ({ kind: 'page', label: p.label, detail: p.href, href: p.href }));
}

/**
 * Whether `/api/subgraph-search` can say anything useful about this query.
 *
 * The route treats a short `Qm` or a partial `0x` as a name, and no subgraph is named that, so
 * asking would only cost a round trip on every keystroke of a pasted address.
 */
export function subgraphSearchable(q: string): boolean {
  const t = q.trim();
  if (t.length < 2 || t.length > 100) return false;
  if (PARTIAL_HEX_RE.test(t)) return ADDRESS_RE.test(t);
  if (t.startsWith('Qm')) return t.length >= 8;
  return true;
}

function indexerLabel(i: IndexerLike): string {
  return i.name ?? i.ensName ?? shortenAddress(i.id);
}

/** Indexers whose address, verified name or ENS name matches, best matches first. */
export function indexerHits(indexers: readonly IndexerLike[], q: string, limit = 5): OmniHit[] {
  const t = q.trim().toLowerCase();
  if (t.length < 2) return [];
  const byAddress = t.startsWith('0x');

  const scored: { i: IndexerLike; score: number }[] = [];
  for (const i of indexers) {
    const id = i.id.toLowerCase();
    const names = [i.name, i.ensName].filter((n): n is string => !!n).map((n) => n.toLowerCase());
    let score = 0;
    if (id === t) score = 4;
    else if (byAddress && id.startsWith(t)) score = 3;
    else if (names.some((n) => n.startsWith(t))) score = 2;
    else if (names.some((n) => n.includes(t))) score = 1;
    if (score) scored.push({ i, score });
  }

  return scored
    .sort((a, b) => b.score - a.score || indexerLabel(a.i).localeCompare(indexerLabel(b.i)))
    .slice(0, limit)
    .map(({ i }) => ({
      kind: 'indexer',
      label: indexerLabel(i),
      detail: i.name || i.ensName ? shortenAddress(i.id) : 'Indexer',
      href: `/indexers/${i.id.toLowerCase()}`,
    }));
}

/** Subgraph search results as hits, one per deployment. */
export function subgraphHits(results: readonly SubgraphSearchResult[], limit = 6): OmniHit[] {
  const hits: OmniHit[] = [];
  const seen = new Set<string>();

  for (const r of results) {
    const hash = r.currentVersion?.subgraphDeployment?.ipfsHash;
    if (!hash || seen.has(hash)) continue;
    seen.add(hash);
    hits.push({
      kind: 'subgraph',
      label: r.metadata?.displayName || 'Unnamed subgraph',
      detail: shortenAddress(hash, 6),
      href: `/subgraphs/${hash}`,
    });
  }

  return hits.slice(0, limit);
}

/** For a full address, the portfolio pages that take any account. */
export function accountHits(q: string): OmniHit[] {
  const t = q.trim();
  if (!isAddress(t)) return [];
  const a = t.toLowerCase();
  return [
    { kind: 'account', label: 'Delegator portfolio', detail: shortenAddress(a), href: `/delegators/${a}` },
    { kind: 'account', label: 'Curator portfolio', detail: shortenAddress(a), href: `/curators/${a}` },
  ];
}
