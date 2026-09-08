/**
 * Where to reach Arbitrum One, in one place.
 *
 * The fallback matters and the duplication is why. Three modules defaulted to
 * `https://gateway.lodestar-dashboard.com/rpc/42161`, which was the Dispatch gateway and has
 * answered nothing since 2026-07-20. #109 fixed two of them by copying the same constant and the
 * same twelve-line comment into each, and missed `dips-chain.ts` entirely - a dead default survives
 * being fixed twice when the fix is a copy (#99).
 *
 * `PUBLIC_ARBITRUM_RPC` is a public endpoint, rate-limited, and not what production should be using:
 * the indexer directory fans out one oracle call per indexer, and a free endpoint answers a handful
 * a minute before it starts refusing. Production sets `ARBITRUM_RPC_URL`. But a slow fallback is
 * merely a bad default, whereas a dead one is a trap: the first fresh environment fails against a
 * host that does not exist, with an error naming a domain that looks like ours and is not listening.
 */
export const PUBLIC_ARBITRUM_RPC = 'https://arb1.arbitrum.io/rpc';

/**
 * Read at call time rather than at module load, so a test or a script that sets the variable after
 * import still gets it.
 */
export function arbitrumRpcUrl(): string {
  return process.env.ARBITRUM_RPC_URL ?? PUBLIC_ARBITRUM_RPC;
}
