/** What `/api/indexer/[address]/revenue` and `/api/indexer/[address]/pnl` answer. */

export interface RevenueDay {
  date: string;
  indexing_rewards_grt: number;
  rav_grt: number;
  total_grt: number;
}

export interface IndexerRevenue {
  indexer: string;
  windowDays: number;
  indexing_rewards_grt: number;
  rav_grt: number;
  total_grt: number;
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
