/**
 * What `/api/grt-flow` answers.
 *
 * Lived in the page as an interface beside an `as Promise<Resp>` cast on `res.json()`, which is a
 * claim about the payload rather than a check of it. Out here it can be asserted once, in
 * `fetchGrtFlow`, and read by anything else that wants the same numbers.
 */

export interface SupplyBreakdown {
  l1TotalSupply: number;
  l2TotalSupply: number;
  bridgeEscrow: number;
  globalSupply: number;
}

export interface GrtFlowData {
  blockNumber: number | null;
  supply: number;
  globalSupply: number;
  supplyBasis: 'onchain' | 'approx';
  /** Null when the L1 read fails: absent, not zero. */
  supplyBreakdown: SupplyBreakdown | null;
  minted: number;
  burned: number;
  indexingRewards: number;
  queryFees: number;
  staked: number;
  delegated: number;
  signalled: number;
  allocated: number;
  issuancePerBlock: number;
  annualIssuance: number;
  issuanceRatePct: number;
  counts: {
    indexers: number;
    stakedIndexers: number;
    delegators: number;
    curators: number;
    currentEpoch: number;
  };
  params: {
    protocolFeePct: number;
    curationTaxPct: number;
    delegationTaxPct: number;
    delegationRatio: number;
  };
}
