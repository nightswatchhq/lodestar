// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { IndexerPagePending } from '../IndexerPagePending';
import type { EnrichedIndexer } from '@/lib/enriched';

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));

const ADDRESS = '0x1234567890abcdef1234567890abcdef12345678';

function enriched(over: Partial<EnrichedIndexer> = {}): EnrichedIndexer {
  return {
    id: ADDRESS,
    name: 'p-ops2.eth',
    ensName: 'p-ops2.eth',
    stakedTokens: '0',
    lockedTokens: '0',
    delegatedTokens: '0',
    allocatedTokens: '1000000000000000000000',
    allocationCount: 1,
    indexingRewardCut: 400_000,
    queryFeeCut: 0,
    delegatorParameterCooldown: 0,
    lastDelegationParameterUpdate: 0,
    rewardsEarned: '0',
    delegatorShares: '0',
    url: null,
    geoHash: null,
    createdAt: 0,
    selfStakeGRT: 1000,
    delegatedGRT: 2000,
    delegatedThawingGRT: 0,
    delegatorAPR: 15,
    delegationCapacity: { maxCapacity: 0, usedCapacity: 0, availableCapacity: 0, utilizationPercent: 0 },
    reoStatus: 'eligible',
    reoSource: 'oracle',
    reoRenewalTimestamp: null,
    reoExpiresAt: null,
    reoDaysRemaining: 10,
    recentActivity: { delegationsIn7d: 0, undelegationsIn7d: 0, netFlowGRT: 0 },
    effectiveCut: 40,
    overDelegationDilution: null,
    ownStakeRatio: null,
    indexerRewardsOwnGenerationRatio: null,
    provisionedGRT: 1000,
    queryFeesCollectedGRT: 0,
    delegationExchangeRate: null,
    rollingAPY30d: 15,
    rollingAPY90d: 20,
    distinctDataServices: 1,
    score: 80,
    scoreGrade: 'B',
    computedAt: 1,
    qScore: null,
    scoreBreakdown: {
      reo: 0, selfStake: 0, queryVolume: 0, cutStability: 0, allocationEfficiency: 0,
      overDelegation: 0, transparency: 0, delegationTrend: 0, delegatorAPY: 0, dataServiceDiversity: 0,
    },
    ...over,
  };
}

describe('IndexerPagePending', () => {
  it('renders the compact header from the enriched cache, not a full-page spinner', () => {
    render(<IndexerPagePending address={ADDRESS} enriched={enriched()} ensName="p-ops2.eth" />);
    expect(screen.getByRole('heading', { name: 'p-ops2.eth' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Allocations' })).toBeInTheDocument();
  });

  it('spins only when the directory cache has no row for this indexer', () => {
    const { container } = render(<IndexerPagePending address={ADDRESS} enriched={undefined} ensName={null} />);
    expect(screen.queryByRole('heading')).toBeNull();
    expect(container.querySelector('.animate-spin')).toBeTruthy();
  });
});
