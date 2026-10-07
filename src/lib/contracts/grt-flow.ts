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

/** Arbitrum, in GRT. `burned` and `issued` have the bridge taken out (graph-network-subgraph#337). */
export interface GrtBurnsArbitrum {
  burned: number;
  issued: number;
  grossBurned: number;
  bridgeBurned: number;
  grossMinted: number;
  bridgeMinted: number;
}

/** Ethereum mainnet, in GRT. No bridge correction: the mainnet side of the bridge escrows. */
export interface GrtBurnsMainnet {
  burned: number;
  minted: number;
}

/** From grt-supply-nest, one nest per chain. Each part is null when its nest is not answering. */
export interface GrtBurns {
  arbitrum: GrtBurnsArbitrum | null;
  mainnet: GrtBurnsMainnet | null;
  /** Both chains. Null unless both answered, so a one-chain figure never reads as the whole. */
  totalBurned: number | null;
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
  /** Absent from a kittiwake older than this field; the page shows "—" rather than failing. */
  burns?: GrtBurns;
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
