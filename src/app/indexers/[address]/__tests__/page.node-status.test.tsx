// @vitest-environment jsdom
/**
 * The allocations panel while kittiwake is still probing the indexer's node.
 *
 * kittiwake#152 serves the last probe result within two seconds and finishes the probe in the
 * background, leaving every deployment reading `unreachable` until it lands. lodestar#238: that is
 * a claim about the indexer built out of an unfinished request.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Suspense } from 'react';
import { act, render, screen } from '@testing-library/react';
import type { IndexerNode } from '@/lib/contracts/indexer-node';

const answered = <T,>(data: T) => ({
  status: 'success',
  fetchStatus: 'idle',
  data,
  error: null,
  isPending: false,
  isLoading: false,
  dataUpdatedAt: 1_700_000_000_000,
});

const INDEXER = '0x1234567890abcdef1234567890abcdef12345678';
const DEPLOYMENT = '0xdeploy00000000000000000000000000000000000000000000000000000000001';

let status: ReturnType<typeof answered<unknown>>;

const indexer = {
  id: INDEXER,
  account: { id: INDEXER, defaultDisplayName: null, operators: [] },
  stakedTokens: '2000000000000000000000000',
  lockedTokens: '0',
  delegatedTokens: '0',
  delegatedThawingTokens: '0',
  allocatedTokens: '1000000000000000000000000',
  tokenCapacity: '0',
  allocationCount: 1,
  indexingRewardCut: 900000,
  queryFeeCut: 900000,
  rewardsEarned: '0',
  queryFeesCollected: '0',
  delegatorShares: '0',
  delegatorParameterCooldown: 0,
  lastDelegationParameterUpdate: 0,
  url: null,
  geoHash: null,
  createdAt: 1700000000,
  closedAllocations: [],
  delegators: [],
  allocations: [
    {
      id: 'a1',
      allocatedTokens: '1000000000000000000000000',
      createdAtEpoch: 1,
      subgraphDeployment: {
        id: DEPLOYMENT,
        ipfsHash: 'QmTest000000000000000000000000000000000000000',
        displayName: 'a subgraph',
        signalledTokens: '1000000000000000000000',
        stakedTokens: '1000000000000000000000',
      },
    },
  ],
};

vi.mock('@/hooks/useNetworkStats', () => ({
  useIndexerDetail: () => answered(indexer),
  useIndexerStatus: () => status,
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
  useIndexerPayments: () => answered(undefined),
  useAprProvenance: () => answered({ reconcile: null, events: [] }),
  useAnnualIndexingIssuance: () => 96.584 * 2_610_223,
}));

vi.mock('@/hooks/useFoghorn', () => ({ useIndexerAllocationsQos: () => answered(undefined) }));
vi.mock('next/dynamic', () => ({ default: () => () => null }));
vi.mock('@/components/indexer/DisputesSection', () => ({ DisputesSection: () => null }));
vi.mock('@/components/foghorn/FoghornScorecard', () => ({ FoghornScorecard: () => null }));
vi.mock('@/components/foghorn/FoghornAlertBanner', () => ({ FoghornAlertBanner: () => null }));
vi.mock('@/components/feed/DelegationFeed', () => ({ DelegationFeed: () => null }));
vi.mock('@/components/ParameterHistory', () => ({ ParameterHistory: () => null }));

import IndexerDetailPage from '../page';

const statusAnswer = (node: IndexerNode | undefined) => ({
  indexerAddress: INDEXER,
  indexerUrl: 'https://indexer.example',
  totalAllocations: 1,
  syncedCount: 0,
  syncingCount: 0,
  failedCount: 0,
  unreachableCount: 1,
  node,
  deployments: [
    {
      deploymentId: DEPLOYMENT,
      ipfsHash: 'QmTest000000000000000000000000000000000000000',
      displayName: 'a subgraph',
      allocatedTokens: '1000000000000000000000000',
      signalledTokens: '1000000000000000000000',
      stakedTokens: '1000000000000000000000',
      createdAtEpoch: 1,
      status: 'unreachable' as const,
    },
  ],
});

const probing: IndexerNode = {
  reachable: null,
  checkedAt: null,
  ageSeconds: null,
  stale: false,
  lastReachedAt: null,
  error: null,
  pending: true,
};

const down: IndexerNode = {
  reachable: false,
  checkedAt: 1_000_600,
  ageSeconds: 60,
  stale: false,
  lastReachedAt: 1_000_000,
  error: 'connection refused',
  pending: false,
};

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
  status = answered(statusAnswer(probing));
});

describe('the allocations panel while the node is being probed', () => {
  it('says it is checking rather than calling the node unreachable', async () => {
    await renderPage();
    expect(await screen.findByText('checking the node')).toBeInTheDocument();
    expect(screen.queryByText(/unreachable/)).toBeNull();
    expect(screen.getByText('Checking')).toBeInTheDocument();
  });

  it('calls the node unreachable once the probe says so, and says when it last answered', async () => {
    status = answered(statusAnswer(down));
    await renderPage();
    expect(await screen.findByText(/1 unreachable/)).toBeInTheDocument();
    expect(screen.getByText('(last reached 11m ago)')).toBeInTheDocument();
    expect(screen.queryByText('checking the node')).toBeNull();
  });

  it('reads as it always did against a kittiwake that sends no node block', async () => {
    status = answered(statusAnswer(undefined));
    await renderPage();
    expect(await screen.findByText(/1 unreachable/)).toBeInTheDocument();
    expect(screen.queryByText('checking the node')).toBeNull();
  });
});
