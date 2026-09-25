/**
 * Signal over allocated stake on a deployment. Same reading as `/subgraphs`.
 * p2p.org calls this Proportion. A value above the network average pays more
 * indexing rewards per allocated GRT than a typical allocation.
 */
export const RATIO_TOOLTIP =
  'Curation signal divided by allocated stake on this deployment. Above the network average pays more per GRT than a typical allocation.';

export function signalStakeRatio(signalGrt: number, stakeGrt: number): number | null {
  if (!(stakeGrt > 0) || !Number.isFinite(signalGrt) || !Number.isFinite(stakeGrt)) return null;
  return signalGrt / stakeGrt;
}

export function ratioVsNetwork(ratio: number, networkRatio: number): number | null {
  if (!(networkRatio > 0) || !Number.isFinite(ratio)) return null;
  return ratio / networkRatio;
}
