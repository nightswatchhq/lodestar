// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { IndexerQosPoint, IndexerQosResponse } from '@/lib/contracts/indexer-qos';
import type { FoghornQosBuckets, IndexerQuality } from '@/lib/foghorn';

type Q<T> = { status: string; fetchStatus: string; data?: T; error?: Error };
let qos: Q<IndexerQosResponse>;
let buckets: Q<FoghornQosBuckets>;
let quality: Q<IndexerQuality>;

vi.mock('@/hooks/useNetworkStats', () => ({ useIndexerQos: () => qos }));
vi.mock('@/hooks/useFoghorn', () => ({
  useIndexerQosBuckets: () => buckets,
  useIndexerQuality: () => quality,
}));

import { IndexerQoSChart } from '../IndexerQoSChart';

const ready = <T,>(data: T): Q<T> => ({ status: 'success', fetchStatus: 'idle', data });
const nowSeconds = () => Math.floor(Date.now() / 1000);

const point = (date: string, over: Partial<IndexerQosPoint> = {}): IndexerQosPoint => ({
  date,
  queryCount: 1000,
  successRate: 100,
  latencyMs: 100,
  blocksBehind: 3,
  avgQueryFee: 0.001,
  totalQueryFees: 1,
  buckets: 288,
  partial: false,
  badBuckets: 0,
  worstBucket: null,
  secondsBehind: 12,
  shareQueriesOver5MinBehind: 0,
  shareWithBlockTime: 1,
  gatewayIds: ['0xgw'],
  ...over,
});

const response = (over: Partial<IndexerQosResponse> = {}): IndexerQosResponse => ({
  qos: [point('2026-09-06', { successRate: 100 }), point('2026-09-07', { successRate: 50, partial: true, buckets: 170 })],
  summary: {
    days: 2,
    queryCount: 2000,
    successRate: 95,
    latencyMs: 190,
    secondsBehind: 12,
    totalQueryFees: 2,
    avgQueryFee: 0.001,
    latestAvgQueryFee: 0.0042,
    latestDate: '2026-09-07',
    buckets: 458,
    badBuckets: 10,
    worstBucket: { start: 1788876300, successRate: 0, queries: 52286 },
  },
  freshness: { publisherLastPostAt: nowSeconds() - 1800, newestDate: '2026-09-07', newestDateBuckets: 170 },
  ...over,
});

const fogBuckets = (over: Partial<FoghornQosBuckets> = {}): FoghornQosBuckets => ({
  source: 'foghorn',
  gateway_id: 'foghorn',
  method: 'probes',
  query_count_means: 'probes dispatched',
  independent_of: 'edge & node',
  window_hours: 720,
  dispatch: { paid_direct: 2932, via_gateway: 5908, note: '' },
  buckets: [
    {
      indexer_wallet: '0x1',
      subgraph_deployment_ipfs_hash: 'Qm1',
      bucket_start: '2026-09-07T00:00:00Z',
      bucket_secs: 300,
      gateway_id: 'foghorn',
      chain_id: null,
      query_count: 4,
      num_indexer_200_responses: 3,
      proportion_indexer_200_responses: 0.75,
      avg_indexer_latency_ms: 200,
      max_indexer_latency_ms: 200,
      stdev_indexer_latency_ms: null,
      latency_p50_ms: null,
      latency_p95_ms: null,
      latency_p99_ms: null,
      avg_indexer_blocks_behind: null,
      max_indexer_blocks_behind: null,
      comparable_count: 5,
      divergent_count: 2,
      correctness_rate: 0.6,
    },
  ],
  ...over,
});

beforeEach(() => {
  qos = ready(response());
  buckets = ready(fogBuckets());
  quality = { status: 'pending', fetchStatus: 'fetching' };
});

describe('IndexerQoSChart', () => {
  it('keeps every chart the old card had, with blocks behind as time behind the freshest peer', () => {
    render(<IndexerQoSChart indexer="0x1" />);
    expect(screen.getByText('Query Performance')).toBeInTheDocument();
    for (const label of ['Query Count', 'Query Fees', 'Avg. Query Fee', 'Query Success Rate', 'Avg. Indexer Latency', 'Behind Freshest Peer']) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    expect(screen.getByRole('link', { name: 'source: Edge & Node QoS oracle' })).toHaveAttribute('href', '/qos');
    expect(screen.getByText(/90 day window/)).toBeInTheDocument();
  });

  /** The old headline was a mean of daily figures: 100% and 50% read 75.00% however many queries each day carried. */
  it('headlines the query-weighted window, not a mean of the days', () => {
    render(<IndexerQoSChart indexer="0x1" />);
    expect(screen.getByText('95.00%')).toBeInTheDocument();
    expect(screen.queryByText('75.00%')).not.toBeInTheDocument();
    expect(screen.getByText('190ms')).toBeInTheDocument();
  });

  it('shows the average fee over the window and the latest day separately', () => {
    render(<IndexerQoSChart indexer="0x1" />);
    expect(screen.getByText('0.001000 GRT')).toBeInTheDocument();
    expect(screen.getByText(/latest day \(2026-09-07\) 0\.004200 GRT/)).toBeInTheDocument();
  });

  it('puts the bad buckets and the worst five minutes where they can be seen', () => {
    render(<IndexerQoSChart indexer="0x1" />);
    expect(screen.getByText(/10 five-minute buckets under 90%/)).toBeInTheDocument();
    expect(screen.getByText(/worst five minutes 0\.0% of 52,286 queries, 09-08 14:05 UTC/)).toBeInTheDocument();
  });

  it('counts partial days and says a missing day is a gap, not a zero', () => {
    render(<IndexerQoSChart indexer="0x1" />);
    expect(screen.getByText(/1 partial day \(fewer than 288 five-minute buckets\) drawn hollow; days with no postings are gaps, not zeros/)).toBeInTheDocument();
  });

  it('distinguishes missing data from stale or unknown indexed publisher posts', () => {
    qos = ready(response({ qos: [], freshness: { publisherLastPostAt: nowSeconds() - 1800, newestDate: null, newestDateBuckets: null } }));
    const { unmount } = render(<IndexerQoSChart indexer="0x1" />);
    expect(screen.getByText(/No QoS data is available for this indexer in the last 90 days/)).toBeInTheDocument();
    unmount();

    qos = ready(response({ qos: [], freshness: { publisherLastPostAt: nowSeconds() - 3 * 3600, newestDate: null, newestDateBuckets: null } }));
    const second = render(<IndexerQoSChart indexer="0x1" />);
    expect(screen.getByText(/latest indexed publisher post is ~3 h old; recent data may be incomplete/)).toBeInTheDocument();
    second.unmount();

    qos = ready(response({ qos: [], freshness: { publisherLastPostAt: null, newestDate: null, newestDateBuckets: null } }));
    render(<IndexerQoSChart indexer="0x1" />);
    expect(screen.getByText(/latest indexed publisher post is unknown/)).toBeInTheDocument();
  });

  it('warns above the charts when indexed posts are stale but older figures exist', () => {
    qos = ready(response({ freshness: { publisherLastPostAt: nowSeconds() - 5 * 3600, newestDate: '2026-09-07', newestDateBuckets: 170 } }));
    render(<IndexerQoSChart indexer="0x1" />);
    expect(screen.getByText(/latest indexed publisher post is ~5 h old/)).toBeInTheDocument();
  });

  it('says the read failed rather than that there is nothing to show', () => {
    qos = { status: 'error', fetchStatus: 'idle', error: new Error('Indexer QoS failed: 503') };
    render(<IndexerQoSChart indexer="0x1" />);
    expect(screen.getByText('Indexer QoS failed: 503')).toBeInTheDocument();
    expect(screen.queryByText(/No QoS data/)).not.toBeInTheDocument();
  });

  it("labels Foghorn's series as probes, never demand, with the paid share stated", () => {
    render(<IndexerQoSChart indexer="0x1" />);
    expect(screen.getByText('Correctness, Foghorn probes')).toBeInTheDocument();
    expect(screen.getByText('60.00%')).toBeInTheDocument();
    expect(screen.getByText(/queries Lodestar dispatched to measure this indexer, never demand/)).toBeInTheDocument();
    expect(screen.getByText(/33% of those probes were paid direct and carry no selection bias; the other 67% went through Edge & Node's gateway/)).toBeInTheDocument();
  });

  it("gives Foghorn's window percentiles when it has them", () => {
    quality = ready({
      indexer_address: '0x1', days: 30, total_probes: 10, divergent_probes: 0, divergence_rate: 0,
      avg_latency_ms: 150, p50_latency_ms: 120, p95_latency_ms: 480, by_deployment: [], recent_probes: [],
    });
    render(<IndexerQoSChart indexer="0x1" />);
    expect(screen.getByText('Foghorn probes over 30 days: p50 120ms, p95 480ms')).toBeInTheDocument();
  });

  it('says so when Foghorn has not probed the indexer, and draws no correctness chart', () => {
    buckets = ready(fogBuckets({ buckets: [] }));
    render(<IndexerQoSChart indexer="0x1" />);
    expect(screen.getByText('Foghorn has not probed this indexer in the last 30 days.')).toBeInTheDocument();
    expect(screen.queryByText('Correctness, Foghorn probes')).not.toBeInTheDocument();
  });
});
