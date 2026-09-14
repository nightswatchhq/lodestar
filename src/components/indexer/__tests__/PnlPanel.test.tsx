// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('@/lib/api', () => ({
  fetchIndexerRevenue: vi.fn(async () => ({
    indexer: '0x1',
    windowDays: 30,
    rav_grt: 7.1,
    indexing_rewards_grt: 60,
    total_grt: 67.1,
    query_fees_gross_grt: 8.86,
    indexing_rewards_gross_grt: 100,
    daily: [
      { date: '2026-09-01', rav_grt: 7.1, indexing_rewards_grt: 60, total_grt: 67.1, query_fees_gross_grt: 8.86, indexing_rewards_gross_grt: 100 },
    ],
  })),
  fetchIndexerPnl: vi.fn(async () => ({
    pnl: {
      revenue_grt: 67.1, revenue_usd: null, infra_cost_usd: 0, infra_monthly_usd: 0, net_usd: null,
      margin_pct: null, breakeven_grt_price: null, perDeployment: [],
    },
    costModel: { lines: [], baseOverheadUsd: 0, totalMonthlyUsd: 0 },
    defaultChainCosts: {},
  })),
}));

import { PnlPanel, PNL_CORRECTED_ON } from '../PnlPanel';

function renderPanel() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <PnlPanel indexer="0x1" grtPrice={0} />
    </QueryClientProvider>,
  );
}

describe('PnlPanel', () => {
  /** It used to say "realised at allocation close" over collected fees and the delegators' rewards. */
  it('says the revenue is what the indexer received, and after whom', async () => {
    renderPanel();
    expect(await screen.findByText('Revenue Received')).toBeInTheDocument();
    expect(screen.getByText(/what the indexer received, dated by the collection that paid it/)).toBeInTheDocument();
    expect(screen.getByText(/the curators' share and the delegators' cut/)).toBeInTheDocument();
    expect(screen.queryByText(/allocation close/)).not.toBeInTheDocument();
    expect(screen.queryByText(/RAV/)).not.toBeInTheDocument();
  });

  /** The panel was wrong in production for most indexers; it says so where the figures are. */
  it('says, dated and in plain words, what the panel used to get wrong', async () => {
    renderPanel();
    const note = await screen.findByRole('note');
    expect(note).toHaveTextContent(`Corrected on ${PNL_CORRECTED_ON}.`);
    expect(note).toHaveTextContent(/missed rewards collected on open allocations/);
    expect(note).toHaveTextContent(/counted the delegators' share as the indexer's revenue and showed query fees gross/);
    expect(note).toHaveTextContent(/54 of the 58 paid indexers were shown more than 1 GRT off/);
    expect(screen.getByRole('link', { name: 'What was wrong' })).toHaveAttribute(
      'href',
      'https://learn-thegraph.com/dispatches/the-pnl-was-wrong/',
    );
  });
});
