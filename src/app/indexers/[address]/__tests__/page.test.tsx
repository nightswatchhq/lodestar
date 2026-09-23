// @vitest-environment jsdom
/**
 * The profile when kittiwake#153 leaves a section out: the frame stays, it says which read failed
 * and why, and nothing computed from it is rendered as zero or as empty. lodestar#239.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Suspense } from 'react';
import { act, render, screen } from '@testing-library/react';
import type { IndexerDetail, MissableSection } from '@/lib/contracts/indexer-detail';

const nav = { tab: null as string | null, extra: {} as Record<string, string> };
vi.mock('next/navigation', () => ({
  useSearchParams: () => {
    const p = new URLSearchParams();
    if (nav.tab) p.set('tab', nav.tab);
    for (const [k, v] of Object.entries(nav.extra)) p.set(k, v);
    return p;
  },
  useRouter: () => ({ replace: vi.fn() }),
  redirect: vi.fn(),
}));
vi.mock('wagmi', () => ({ useAccount: () => ({ address: undefined }) }));

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
  // A kittiwake without the delegators route, so the tab falls back to the list above.
  useIndexerDelegators: () => answered(null),
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
  useAnnualIndexingIssuance: () => 96.584 * 2_610_223,
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
const without = (part: MissableSection, reason: string): IndexerDetail => {
  const indexer: IndexerDetail = { ...whole(), degraded: [{ part, reason }] };
  if (part === 'operators') delete indexer.account.operators;
  else delete indexer[part];
  return indexer;
};

/** `params` is a promise the page reads with `use`, so the render has to be let settle. */
async function renderPage(tab?: string, extra: Record<string, string> = {}) {
  nav.tab = tab ?? null;
  nav.extra = extra;
  await act(async () => {
    render(
      <Suspense fallback={null}>
        <IndexerDetailPage params={Promise.resolve({ address: INDEXER })} />
      </Suspense>,
    );
  });
}

beforeEach(() => {
  nav.tab = null;
  nav.extra = {};
  detail = answered(whole());
});

describe('the indexer page when a section is missing', () => {
  it('renders a whole answer as it always did', async () => {
    await renderPage();
    expect(await screen.findByText('Self-Stake')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Allocations' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Active Allocations' })).toBeNull();
    expect(screen.queryByText(/could not be loaded/)).toBeNull();
  });

  it('keeps the delegators frame, says the read failed and why, and shows no share of the pool', async () => {
    detail = answered(without('delegators', 'nest_upstream'));
    await renderPage('delegators');

    expect(await screen.findByRole('heading', { name: 'Delegators' })).toBeInTheDocument();
    expect(screen.getByText(/The delegator list could not be loaded/)).toBeInTheDocument();
    expect(screen.getByText(/The nest it is read from refused the read/)).toBeInTheDocument();
    // Nothing derived from the list: no rank, no share, no empty table standing in for it.
    expect(screen.queryByText(/of pool/)).toBeNull();
    expect(screen.queryByText('#1')).toBeNull();
    expect(screen.getByRole('heading', { name: '0x1234...5678' })).toBeInTheDocument();
  });

  it('withholds every figure computed from the allocations, and keeps the ones that are not', async () => {
    detail = answered(without('allocations', 'nest_busy'));
    await renderPage('overview');

    expect(await screen.findByRole('heading', { name: 'APR Provenance' })).toBeInTheDocument();
    expect(screen.getByText(/was too busy to answer/)).toBeInTheDocument();
    expect(screen.queryByText('= Delegator APR')).toBeNull();
    expect(screen.getByText('3 allocations')).toBeInTheDocument();
  });

  it('keeps the allocations frame when that section is missing', async () => {
    detail = answered(without('allocations', 'nest_busy'));
    await renderPage('allocations');

    expect(await screen.findByRole('heading', { name: 'Active Allocations' })).toBeInTheDocument();
    expect(screen.getByText(/was too busy to answer/)).toBeInTheDocument();
  });

  it('says the operator list failed rather than showing the indexer as having none', async () => {
    detail = answered(without('operators', 'nest_timeout'));
    await renderPage();

    expect(await screen.findByText(/The operator list could not be loaded/)).toBeInTheDocument();
    expect(screen.getByText(/did not answer in time/)).toBeInTheDocument();
    expect(screen.queryByText(/^Operators?:$/)).toBeNull();
  });

  it('keeps the closed allocations frame, which an indexer with none does not get', async () => {
    detail = answered(without('closedAllocations', 'nest_unready'));
    await renderPage('allocations', { view: 'closed' });

    expect(await screen.findByRole('heading', { name: 'Closed Allocations' })).toBeInTheDocument();
    expect(screen.getByText(/still catching up/)).toBeInTheDocument();
  });

  it('shows no missing-section frame for a section that answered with nothing in it', async () => {
    await renderPage('allocations');
    expect(screen.queryByText(/could not be loaded/)).toBeNull();
    expect(screen.getByRole('heading', { name: 'Allocations' })).toBeInTheDocument();
    expect(screen.getByText(/No allocations in this view/)).toBeInTheDocument();
  });
});
