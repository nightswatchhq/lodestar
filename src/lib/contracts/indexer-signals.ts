/**
 * Shapes the indexer hooks read, lifted out of `useNetworkStats` so the fetchers can live in
 * `lib/api.ts` without the hooks module and the API module importing each other.
 */

export interface SubgraphHistoryPoint {
  date: string;
  signalGrt: number;
  stakeGrt: number;
}

export interface SubgraphVersion {
  version: number;
  label: string | null;
  createdAt: number;
  ipfsHash: string;
  signalledTokens: string;
  stakedTokens: string;
  isCurrent: boolean;
}

export interface IndexerDispute {
  id: string;
  dispute_type: string | null;
  fisherman: string | null;
  allocation_id: string | null;
  deployment_id: string | null;
  status: string | null;
  tokens_slashed_grt: string | null;
  tokens_burned_grt: string | null;
  created_at: string | null;
  closed_at: string | null;
}

export interface DelegationEvent {
  id: string;
  eventType: string;
  indexer: string;
  delegator: string;
  tokens: string;
  timestamp: string;
  txHash: string;
}

/**
 * The Rewards Eligibility Oracle's reading for one indexer.
 *
 * `useREOStatus` used to return `res.json()` with no type at all, so `reoData.status.status` was
 * `any` all the way down and two pages read it that way. `oracleStale` is the field that matters
 * and the one an untyped read loses: an eligibility answer from an oracle that stopped updating is
 * not an eligibility answer.
 */
export interface REOStatus {
  address: string;
  available: boolean;
  status: 'eligible' | 'ineligible' | 'unknown' | string;
  isEligible: boolean;
  enforced: boolean;
  daysRemaining: number | null;
  expiresAt: number | null;
  renewalTimestamp: number | null;
  eligibilityPeriod: number | null;
  oracleStale: boolean;
  oracleUpdatedAt: number | null;
  source: string | null;
}

export interface REOStatusResponse {
  status: REOStatus;
}

/**
 * Narrow the oracle's answer to the three values the scorer understands.
 *
 * The wire type is a string because the oracle is free to grow a fourth status and this frontend
 * should not crash when it does. Both indexer pages used to pass it straight through with
 * `reoData.status.status === 'unknown' ? 'unknown' : reoData.status.status`, which reads like a
 * check and is not one: everything that is not the literal "unknown" was asserted to be eligible or
 * ineligible, including a status nobody here has ever seen. An unrecognised answer is unknown.
 */
export function reoStatusOrUnknown(status: string): 'eligible' | 'ineligible' | 'unknown' {
  return status === 'eligible' || status === 'ineligible' ? status : 'unknown';
}

/** Same, for where the reading came from. Anything that is not the oracle is a heuristic. */
export function reoSourceOrHeuristic(source: string | null): 'oracle' | 'heuristic' {
  return source === 'oracle' ? 'oracle' : 'heuristic';
}
