// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { IndexerTrendsResponse } from '@/lib/contracts/indexer-trends';

let mockQuery: { status: string; fetchStatus: string; data?: IndexerTrendsResponse; error?: Error };
vi.mock('@/hooks/useNetworkStats', () => ({
  useIndexerTrends: () => mockQuery,
}));

import { IndexerTrendsChart } from '../IndexerTrendsChart';

const ready = (data: IndexerTrendsResponse) => ({ status: 'success', fetchStatus: 'idle', data });

describe('IndexerTrendsChart', () => {
  it('keeps the three tabs the old chart had', () => {
    mockQuery = ready({ rewards: [], queryFees: [] });
    render(<IndexerTrendsChart indexer="0x1" />);
    expect(screen.getByText('Daily Trends')).toBeInTheDocument();
    for (const tab of ['Rewards', 'Query Fees', 'Cumulative']) {
      expect(screen.getByRole('button', { name: tab })).toBeInTheDocument();
    }
  });

  /** The old chart read `{ data, isLoading }` and drew "No trend data available yet" for an outage. */
  it('says the read failed rather than that there is nothing to show', () => {
    mockQuery = { status: 'error', fetchStatus: 'idle', error: new Error('Indexer trends failed: 503') };
    render(<IndexerTrendsChart indexer="0x1" />);
    expect(screen.getByText('Indexer trends failed: 503')).toBeInTheDocument();
    expect(screen.queryByText(/No trend data available yet/)).not.toBeInTheDocument();
  });

  it('keeps each empty state the old chart had', () => {
    mockQuery = ready({ rewards: [], queryFees: [] });
    render(<IndexerTrendsChart indexer="0x1" />);
    expect(screen.getByText('No trend data available yet')).toBeInTheDocument();

    mockQuery = ready({
      rewards: [],
      queryFees: [{ timestamp: '1787356800000000', indexer: '0x1', totalCollected: '1', totalCurators: '0', totalProtocolTax: '0', totalCollectedNet: '1', feeCount: '1' }],
    });
    const { unmount } = render(<IndexerTrendsChart indexer="0x1" />);
    expect(screen.getAllByText('No reward data for this period').length).toBeGreaterThan(0);
    fireEvent.click(screen.getAllByRole('button', { name: 'Cumulative' }).at(-1)!);
    expect(screen.getByText('No reward data for cumulative view')).toBeInTheDocument();
    unmount();

    mockQuery = ready({
      rewards: [{ timestamp: '1787356800000000', indexer: '0x1', totalRewards: '3', totalIndexerRewards: '1', totalDelegationRewards: '2', rewardCount: '1' }],
      queryFees: [],
    });
    render(<IndexerTrendsChart indexer="0x1" />);
    fireEvent.click(screen.getAllByRole('button', { name: 'Query Fees' }).at(-1)!);
    expect(screen.getByText('No query fee data for this period')).toBeInTheDocument();
  });

  it('names its source and says what net means', () => {
    mockQuery = ready({ rewards: [], queryFees: [] });
    render(<IndexerTrendsChart indexer="0x1" />);
    expect(screen.getByText(/graph-allocations-nest/)).toBeInTheDocument();
    expect(screen.getByText(/after the 1% protocol tax, the curators' share and the delegators' cut/)).toBeInTheDocument();
  });

  it('says fees are gross, days are UTC, and what it read before', () => {
    mockQuery = ready({ rewards: [], queryFees: [] });
    render(<IndexerTrendsChart indexer="0x1" />);
    expect(screen.getByText(/Fees are shown gross, with net beside them, over UTC calendar days/)).toBeInTheDocument();
    expect(screen.getByText(/Until 5 September this chart read a community subgraph/)).toBeInTheDocument();
    expect(screen.getByText(/every indexer-day from 24 July to 22 August matched to the wei/)).toBeInTheDocument();
  });
});
