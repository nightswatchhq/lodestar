/**
 * The shape of one indexer's answer about a deployment, and the tolerance a reader judges it with.
 *
 * Types and one constant, deliberately with no implementation beside them. They used to live in
 * `indexing-status.ts` alongside the probe itself, so a page needing a number imported a module
 * that reached for a TAP signing key, an SSRF guard and a live HTTP probe. The route that ran all
 * of that moved to kittiwake on 2026-09-11 (nightswatchhq/kittiwake#116, #117); this is what the
 * frontend still needs in order to render the answer it is handed.
 */

export type ServeProbe = 'serving' | 'alive_paid' | 'broken' | 'unreachable';

/**
 * How a probe reached its verdict, kept beside the verdict so a `broken` can be told apart after
 * the fact (lodestar#62): a transport failure that never got a response looks the same as an edge
 * answering 403 HTML once both are collapsed to `broken`, and they point at different culprits.
 *  - guard     — the SSRF guard refused the URL before any request was made
 *  - transport — every attempt failed without a response: `error` is the deepest error code or
 *                name (`timeout` when our own budget expired, else e.g. ECONNRESET,
 *                UND_ERR_CONNECT_TIMEOUT, ERR_TLS_CERT_ALTNAME_INVALID)
 *  - response  — a response arrived and was classified: `status` and `contentType` are its
 */
export interface ServeProbeOutcome {
  probe: ServeProbe;
  cause: 'guard' | 'transport' | 'response';
  error: string | null;
  status: number | null;
  contentType: string | null;
  /** whether a TAP receipt was attached, which decides which classifier read the response */
  paid: boolean;
  attempts: number;
  elapsedMs: number;
}
export interface IndexerStatusResult {
  indexerId: string;
  indexerName: string | null;
  url: string;
  allocatedTokens: string;
  status: 'synced' | 'syncing' | 'failed' | 'unreachable';
  /** single-probe serving classification (RFC-006 D1); persistence is applied downstream */
  serveProbe?: ServeProbe;
  /** how `serveProbe` was reached; what a `broken` actually saw (lodestar#62) */
  serveProbeDetail?: ServeProbeOutcome;
  /** convenience: serveProbe === 'alive_paid' */
  servable?: boolean;
  health?: 'healthy' | 'unhealthy' | 'failed';
  synced?: boolean;
  chainHeadBlock?: number;
  latestBlock?: number;
  network?: string;
  entityCount?: string;
  fatalError?: {
    message: string;
    handler?: string | null;
    block?: { number: number; hash?: string } | null;
    deterministic?: boolean;
  };
  nonFatalErrors?: string[];
  nonFatalErrorCount?: number;
  syncProgress?: number; // 0-100
  blocksBehind?: number;
  /**
   * The canonical head this indexer's lag was measured against — the max head
   * observed across all indexers on the deployment (set by reconcileToNetworkHead).
   * Present when blocksBehind is relative to the network rather than self.
   */
  networkChainHead?: number;
}

/**
 * Blocks within this distance of the head count as "effectively synced". The
 * graph-node `synced` flag is unreliable (it means "caught up at some point"),
 * so we use the gap instead.
 */
export const SYNC_TOLERANCE_BLOCKS = 50;

/**
 * RFC-006 D2: the instantaneous read over one round of probes.
 *
 * The assessment runs on kittiwake now; this is the shape it hands back.
 */
export interface ServabilityVerdict {
  /** distinct operators with at least one servable indexer */
  effectiveServingOperators: number;
  /** count of individual servable indexers */
  servingIndexerCount: number;
  /** no operator can serve — queries will fail despite any reported sync */
  effectivelyDead: boolean;
  /** dead now, but a rescue (a syncing indexer) is catching up */
  recovering: boolean;
  /**
   * Largest single operator's share of allocated stake (0–1). Surfaced ONLY as
   * a fragility / single-point-of-failure warning — NEVER as `dead`.
   */
  dominantOperatorShare: number;
}

export type GatewayVerdict =
  | 'served' // gateway returned attested data
  | 'bad-indexers' // every tried indexer was rejected
  | 'no-indexers' // no indexers available to try
  | 'not-found' // deployment/subgraph unknown to the gateway
  | 'error'; // some other gateway error

export type RenderedState =
  | 'ok' // at least one operator served this round
  | 'rechecking' // dead this round, but not for K rounds yet: amber, non-terminal copy
  | 'conflicting' // dead by direct probes, served by the gateway in the same round: amber, log it
  | 'dead'; // K consecutive dead rounds, none of them served by the gateway

/**
 * RFC-006 D5 (lodestar#59): what the page may render, derived from the last K rounds rather than
 * from the instantaneous verdict. A single dead round is never `dead`.
 */
export interface RenderedServability {
  state: RenderedState;
  /** What the banner may say. True only for `state === 'dead'`. */
  effectivelyDead: boolean;
  /** Consecutive dead rounds ending at the newest, gateway-served rounds resetting it. */
  deadStreak: number;
  /** The threshold in force. */
  k: number;
  /** When the newest round was probed, so a cached verdict is visibly a snapshot. */
  probedAt: string | null;
}

export interface DeploymentIndexingStatus {
  deploymentId: string;
  ipfsHash: string;
  displayName: string | null;
  signalledTokens: string;
  stakedTokens: string;
  indexers: IndexerStatusResult[];
  totalIndexers: number;
  totalAllocations: number;
  syncedCount: number;
  healthyCount: number;
  unhealthyCount: number;
  failedCount: number;
  unreachableCount: number;
  /** RFC-006 D2 — live serving verdict over the allocated set (null if not probed) */
  servability?: ServabilityVerdict | null;
  /** RFC-006 D5 — derived from the last K rounds. Absent on older cached payloads. */
  servabilityRendered?: RenderedServability | null;
  /** The gateway's verdict in the same round, when a key allowed one; the stronger witness. */
  gatewayVerdict?: GatewayVerdict | null;
}
