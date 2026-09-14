/** What `/api/indexer/[address]/revenue` and `/api/indexer/[address]/pnl` answer. */

/**
 * `rav_grt` and `indexing_rewards_grt` are what the indexer received: query fees after the protocol, the
 * curators and the delegators, and rewards after the delegators. The `*_gross_grt` fields are what was
 * collected, which is what the first two meant before nightswatchhq/kittiwake#142.
 */
export interface RevenueDay {
  date: string;
  indexing_rewards_grt: number;
  rav_grt: number;
  total_grt: number;
  query_fees_gross_grt: number;
  indexing_rewards_gross_grt: number;
}

export interface IndexerRevenue {
  indexer: string;
  windowDays: number;
  indexing_rewards_grt: number;
  rav_grt: number;
  total_grt: number;
  query_fees_gross_grt: number;
  indexing_rewards_gross_grt: number;
  daily: RevenueDay[];
}

export interface ChainCost {
  key: string;
  label: string;
  storageTb: number;
  monthlyUsd: number;
}

export interface IndexerPnl {
  pnl: {
    windowDays: number;
    revenue_grt: number;
    revenue_usd: number;
    infra_cost_usd: number;
    infra_monthly_usd: number;
    net_usd: number;
    margin_pct: number;
    grtPrice: number;
    breakeven_grt_price: number;
    perDeployment: Array<{ deployment_id: string; revenue_grt: number; revenue_usd: number }>;
  };
  costModel: {
    lines: unknown[];
    baseOverheadUsd: number;
    totalMonthlyUsd: number;
  };
  defaultChainCosts: Record<string, ChainCost>;
}
