/** What `/api/indexer/[address]/qos`, `/qos-score` and `/qos-deployments` answer. */

/** The lowest-success five-minute bucket with at least 50 queries. `start` is unix seconds. */
export interface QosBucketRef {
  start: number;
  /** 0 to 100. */
  successRate: number | null;
  queries: number | null;
}

export interface IndexerQosPoint {
  /** UTC day, `YYYY-MM-DD`. A day with no postings is absent from the list, never a row of zeros. */
  date: string;
  queryCount: number | null;
  /** 0 to 100, successful responses over queries within the day. */
  successRate: number | null;
  latencyMs: number | null;
  blocksBehind: number | null;
  avgQueryFee: number | null;
  totalQueryFees: number | null;
  /** Five-minute buckets that carried this indexer, out of 288. */
  buckets: number;
  partial: boolean;
  badBuckets: number;
  worstBucket: QosBucketRef | null;
  /** Seconds behind the freshest credible peer on the same deployment. */
  secondsBehind: number | null;
  shareQueriesOver5MinBehind: number | null;
  shareWithBlockTime: number | null;
  gatewayIds: string[];
}

/** The window, computed from the underlying counts rather than averaged from the days. */
export interface IndexerQosSummary {
  days: number;
  queryCount: number | null;
  successRate: number | null;
  latencyMs: number | null;
  secondsBehind: number | null;
  totalQueryFees: number | null;
  avgQueryFee: number | null;
  latestAvgQueryFee: number | null;
  latestDate: string | null;
  buckets: number;
  badBuckets: number;
  worstBucket: QosBucketRef | null;
}

export interface IndexerQosFreshness {
  /** Unix seconds of the publisher's newest post to Gnosis. */
  publisherLastPostAt: number | null;
  newestDate: string | null;
  newestDateBuckets: number | null;
}

export interface IndexerQosResponse {
  qos: IndexerQosPoint[];
  summary: IndexerQosSummary;
  freshness: IndexerQosFreshness;
}

export interface QosScoreLatest {
  day: string | null;
  day_number?: number;
  reliability: number | null;
  lat_util: number | null;
  fresh_util: number | null;
  coverage: number | null;
  /** Allocation share minus routing share, averaged over allocated deployments. */
  served_gap: number | null;
  efficiency: number | null;
  q_score: number | null;
  grade?: string;
}

export interface QosScoreResponse {
  window_days: number;
  latest: QosScoreLatest | null;
  daily: { day: string | null; q_score: number | null }[];
}

export interface QosDeploymentRow {
  deployment_id: string;
  queries: number;
  /** Share of this indexer's served queries. */
  weight: number;
  reliability: number | null;
  reliability_used: number | null;
  cohort_best_reliability: number | null;
  lat_util: number;
  fresh_util: number | null;
  time_behind_sec: number | null;
  time_behind_own_sec: number | null;
  /** This indexer's attempts over every indexer's attempts on the deployment. */
  served_share: number | null;
  q: number | null;
  measured: boolean;
  /** Share of the composite this deployment costs. */
  drag: number;
}

export interface QosDeploymentsResponse {
  window_days: number;
  total: {
    q_score: number | null;
    reliability: number | null;
    lat_util: number | null;
    fresh_util: number | null;
    coverage: number | null;
    credible_deployments: number;
    unmeasured_deployments: number;
  } | null;
  deployments: QosDeploymentRow[];
}
