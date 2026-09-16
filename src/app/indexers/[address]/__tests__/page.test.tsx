// @vitest-environment jsdom
/**
 * The indexer profile when kittiwake leaves a section out.
 *
 * kittiwake#153 answers 200 without a section its nest refused, naming it under `degraded`, rather
 * than failing the whole page with a 502. What this holds the page to is that an absent section
 * reads as absent: its frame stays, it says which read failed and why, and nothing it feeds is
 * quietly rendered as zero or as an empty list. See lodestar#239.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Suspense } from 'react';
import { act, render, screen } from '@testing-library/react';
import type { IndexerDetail } from '@/lib/contracts/indexer-detail';

type Query<T> = {
  status: string;
  fetchStatus: string;
  data?: T;
  error: Error | null;
  isPending: boolean;
  isLoading: boolean;
  dataUpdatedAt: number;
};

const answered = <T,>(data: T): Query<T> => ({
  status: 'success',
  fetchStatus: 'idle',
  data,
  error: null,
  isPending: false,
  isLoading: false,
  dataUpdatedAt: 0,
});

let detail: Query<IndexerDetail | null>;

vi.mock('@/hooks/useNetworkStats', () => ({
  useIndexerDetail: () => detail,
  useGRTPrice: () => answered({ price: 0.1, change24h: 0 }),
  useNetworkStats: () =>
    answered({
      graphNetwork: {
        delegationRatio: 16,
        totalTokensSignalled: '1000000000000000000000000',
        networkGRTIssuancePerBlock: '1000000000000000000',
      },
    }),
  useIndexerProvisions: () => answered({ provisions: [] }),
  useREOStatus: () => answered(undefined),
  useRecentDelegations: () => answered([]),
  useENSName: () => answered({ ensName: null }),
  useEnrichedIndexers: () => answered({ indexers: [] }),
  useIndexerStatus: () => answered(undefined),
  useIndexerPayments: () => answered(undefined),
  useAprProvenance: () => answered({ reconcile: null, events: [] }),
}));

vi.mock('@/hooks/useFoghorn', () => ({ useIndexerAllocationsQos: () => answered(undefined) }));

// The panels that fetch for themselves are not what this page test is about.
vi.mock('next/dynamic', () => ({ default: () => () => null }));
vi.mock('@/components/indexer/DisputesSection', () => ({ DisputesSection: () => null }));
vi.mock('@/components/foghorn/FoghornScorecard', () => ({ FoghornScorecard: () => null }));
vi.mock('@/components/foghorn/FoghornAlertBanner', () => ({ FoghornAlertBanner: () => null }));
vi.mock('@/components/feed/DelegationFeed', () => ({ DelegationFeed: () => null }));
vi.mock('@/components/ParameterHistory', () => ({ ParameterHistory: () => null }));

import IndexerDetailPage from '../page';

const INDEXER = '0x1234567890abcdef1234567890abcdef12345678';

/** One indexer with every part reading, as kittiwake answers when nothing is wrong. */
const whole = (): IndexerDetail => ({
  id: INDEXER,
  account: { id: INDEXER, defaultDisplayName: null, operators: [] },
  stakedTokens: '2000000000000000000000000',
  lockedTokens: '0',
  delegatedTokens: '1000000000000000000000000',
  delegatedThawingTokens: '0',
  allocatedTokens: '1500000000000000000000000',
  tokenCapacity: '0',
  allocationCount: 3,
  indexingRewardCut: 900000,
  queryFeeCut: 900000,
  rewardsEarned: '1000000000000000000000',
  queryFeesCollected: '0',
  delegatorShares: '0',
  delegatorParameterCooldown: 0,
  lastDelegationParameterUpdate: 0,
  url: null,
  geoHash: null,
  createdAt: 1700000000,
  allocations: [],
  closedAllocations: [],
  delegators: [
    {
      id: 'd1',
      stakedTokens: '500000000000000000000000',
      shareAmount: '1',
      delegator: { id: '0xdelegator00000000000000000000000000000001' },
    },
  ],
});

/** The same profile with one section left out and named, as a degraded answer carries it. */
const without = (part: 'delegators' | 'allocations', reason: string): IndexerDetail => {
  const indexer: IndexerDetail = { ...whole(), degraded: [{ part, reason }] };
  delete indexer[part];
  return indexer;
};

/** `params` is a promise the page reads with `use`, so the render has to be let settle. */
async function renderPage() {
  await act(async () => {
    render(
      <Suspense fallback={null}>
        <IndexerDetailPage params={Promise.resolve({ address: INDEXER })} />
      </Suspense>,
    );
  });
}

beforeEach(() => {
  detail = answered(whole());
});

describe('the indexer page when a section is missing', () => {
  it('renders a whole answer as it always did', async () => {
    await renderPage();
    expect(await screen.findByRole('heading', { name: 'Top Delegators' })).toBeInTheDocument();
    expect(screen.getByText(/of pool/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Delegation Calculator' })).toBeInTheDocument();
    expect(screen.queryByText(/could not be loaded/)).toBeNull();
  });

  it('keeps the delegators frame, says the read failed and why, and shows no share of the pool', async () => {
    detail = answered(without('delegators', 'nest_upstream'));
    await renderPage();

    expect(await screen.findByRole('heading', { name: 'Top Delegators' })).toBeInTheDocument();
    expect(screen.getByText(/The delegator list could not be loaded/)).toBeInTheDocument();
    expect(screen.getByText(/The nest it is read from refused the read/)).toBeInTheDocument();
    // Nothing derived from the list: no rank, no share, no empty table standing in for it.
    expect(screen.queryByText(/of pool/)).toBeNull();
    expect(screen.queryByText('#1')).toBeNull();
    // What the indexer's own row says is untouched by the section that failed.
    expect(screen.getByText('Self-Stake')).toBeInTheDocument();
    expect(screen.getByText('3 allocations')).toBeInTheDocument();
  });

  it('withholds every figure computed from the allocations, and keeps the ones that are not', async () => {
    detail = answered(without('allocations', 'nest_busy'));
    await renderPage();

    expect(await screen.findByRole('heading', { name: 'Active Allocations' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'APR Provenance' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Delegation Calculator' })).toBeInTheDocument();
    // Each frame that stood on the allocations says so, and says why, where its figures were.
    expect(screen.getAllByText(/was too busy to answer/)).toHaveLength(3);
    // The APR decomposition and the calculator's estimate are sums over the allocations.
    expect(screen.queryByText('Current APR')).toBeNull();
    expect(screen.queryByText('= Delegator APR')).toBeNull();
    // `allocationCount` is a column on the indexer's own row, not the section, so it still reads.
    expect(screen.getByText('3 allocations')).toBeInTheDocument();
  });
});
