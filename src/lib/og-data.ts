/**
 * The numbers on a preview card, fetched from kittiwake rather than read out of its database.
 *
 * A crawler does not run JavaScript, so these cards are rendered on the server and cannot become
 * client fetches like the rest of the app did. That left three of them reading the nests and
 * Postgres directly, which is the only reason `NUTHATCH_PASSWORD`, `DATABASE_URL` and `REDIS_URL`
 * were still in this project's environment at all. Rendering a PNG is a frontend job; holding a
 * database credential to do it is not.
 *
 * Everything here is best-effort by construction. A card is decoration: a plain one is a fine
 * outcome and a card that never arrives because a backend was slow is not, so the budget is short
 * and every failure returns `null` for the caller to render around.
 */

import { log } from '@/lib/logger';

/** Short, because a crawler will not wait and an unrendered card is worse than a bare one. */
const BUDGET_MS = 4000;

function origin(): string | null {
  const o = process.env.LODESTAR_API_ORIGIN?.replace(/\/+$/, '');
  return o && o.length > 0 ? o : null;
}

/**
 * One read, with a budget. `null` means render the card without these numbers.
 *
 * Unwraps `{ data: ... }` because kittiwake enveloped answers and the incumbent's callers all
 * reached through it; a card asking for `data.data` would be a shape bug that only shows up in a
 * preview image, which is the last place anyone looks.
 */
export async function ogFetch<T>(path: string, budgetMs = BUDGET_MS): Promise<T | null> {
  const base = origin();
  if (!base) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), budgetMs);
  try {
    const res = await fetch(`${base}${path}`, {
      signal: controller.signal,
      cache: 'no-store',
      headers: { accept: 'application/json' },
    });
    // A non-2xx is not data. Returning the parsed error body would put a card's numbers at the
    // mercy of whatever an error envelope happens to contain.
    if (!res.ok) {
      log.api.warn({ path, status: res.status }, 'preview card data was refused');
      return null;
    }
    const body = (await res.json()) as { data?: T } | T;
    return (body && typeof body === 'object' && 'data' in body ? (body as { data: T }).data : (body as T)) ?? null;
  } catch (e) {
    // An abort is our own budget expiring; anything else is the network. Neither is worth a
    // broken card, and neither is worth a silent one either.
    log.api.warn({ path, err: String(e) }, 'preview card data could not be read');
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** The enriched directory row for one indexer, or `null`. */
export async function ogEnrichedIndexer(address: string): Promise<OgEnrichedIndexer | null> {
  const rows = await ogFetch<OgEnrichedIndexer[]>('/api/indexers-enriched?first=1000');
  if (!Array.isArray(rows)) return null;
  const addr = address.toLowerCase();
  return rows.find((r) => r.address?.toLowerCase() === addr) ?? null;
}

/**
 * kittiwake's field names, which are not the ones the Redis payload used: `selfStakeGrt` rather
 * than `selfStakeGRT`, `address` rather than `id`, and the GRT figures already divided rather than
 * wei. Written out rather than inferred, because the last time a `GRT`/`Grt` disagreement went
 * unnoticed it rendered as a zero.
 */
export interface OgEnrichedIndexer {
  address: string;
  selfStakeGrt?: string;
  delegatedGrt?: string;
  allocationCount?: number;
  rewardsEarnedGrt?: string;
  delegatorApr?: string;
  scoreGrade?: string;
  reoStatus?: string;
}

/** A number from a decimal string, or 0. The API sends GRT figures as strings to keep precision. */
export function ogNumber(v: string | number | undefined | null): number {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  if (typeof v !== 'string') return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * kittiwake's directory row for one deployment. The GRT figures are wei strings here, unlike the
 * enriched indexer rows, because this is the same shaping the deployment list has always returned.
 */
export interface OgDeployment {
  id?: string;
  ipfsHash?: string;
  displayName?: string | null;
  signalledTokens?: string;
  stakedTokens?: string;
  queryFeesAmount?: string;
  createdAt?: number;
  /** Arrays whose lengths are the counts, which is what the pages read. */
  indexerAllocations?: unknown[];
  curatorSignals?: unknown[];
}

export async function ogDeployment(ipfsHash: string): Promise<OgDeployment | null> {
  const r = await ogFetch<OgDeployment[] | OgDeployment>(
    `/api/subgraph-deployment/${encodeURIComponent(ipfsHash)}`,
  );
  if (!r) return null;
  return Array.isArray(r) ? (r[0] ?? null) : r;
}

/** What the card says about a manifest: which chain, and whether substreams power it. */
export interface OgManifestFacts {
  network: string | null;
  poweredBySubstreams: boolean;
}

/**
 * Read from kittiwake's parsed manifest rather than by fetching the YAML and matching it here.
 *
 * The incumbent regex-matched `kind: substreams` against the raw document. The parsed answer names
 * each data source's `kind`, so this asks the same question of a structure instead of of a string.
 */
export async function ogManifest(ipfsHash: string): Promise<OgManifestFacts> {
  const m = await ogFetch<{ network?: string | null; dataSources?: { kind?: string }[] }>(
    `/api/manifest?hash=${encodeURIComponent(ipfsHash)}`,
  );
  if (!m) return { network: null, poweredBySubstreams: false };
  return {
    network: m.network ?? null,
    poweredBySubstreams: (m.dataSources ?? []).some((d) =>
      (d.kind ?? '').toLowerCase().startsWith('substreams'),
    ),
  };
}

/** Wei to GRT, for the rows that still carry wei. */
export function ogWeiToGrt(wei: string | number | undefined | null): number {
  if (wei === null || wei === undefined) return 0;
  const s = String(wei).split('.')[0];
  if (!/^-?\d+$/.test(s)) return 0;
  return Number(BigInt(s)) / 1e18;
}
