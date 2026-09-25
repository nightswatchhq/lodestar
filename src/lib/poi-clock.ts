/** SubgraphService maxPOIStaleness today. kittiwake should replace this with the on-chain read. */
export const MAX_POI_STALENESS_SEC = 2_419_200;
export const POI_AMBER_DAYS_LEFT = 7;
export const POI_RED_DAYS_LEFT = 2;
/** Epochs an allocation could stay open before Horizon. */
export const LEGACY_MAX_ALLOCATION_EPOCHS = 28;

export type PoiTone = 'fresh' | 'due' | 'close';

export type PoiClock = {
  daysSince: number;
  daysLeft: number;
  tone: PoiTone;
  /** Words beside the colour. Colour alone fails WCAG 1.4.1. */
  label: string;
  /** False when the row predates Horizon and the clock is epochs against 28. */
  horizon: boolean;
};

export function poiTone(daysLeft: number): PoiTone {
  if (daysLeft <= POI_RED_DAYS_LEFT) return 'close';
  if (daysLeft <= POI_AMBER_DAYS_LEFT) return 'due';
  return 'fresh';
}

export function poiLabel(tone: PoiTone, daysLeft: number): string {
  if (tone === 'close') return daysLeft <= 0 ? 'force-close window' : `${daysLeft.toFixed(0)}d left`;
  if (tone === 'due') return `due soon · ${daysLeft.toFixed(0)}d left`;
  return `fresh · ${daysLeft.toFixed(0)}d left`;
}

/**
 * Days since the last POI, or since creation if none, and days left until maxPOIStaleness.
 * Pre-Horizon rows pass `horizon: false` and `maxSec` of 28 epochs in seconds.
 */
export function poiClock(opts: {
  lastPoiAt: number | null;
  createdAtSec: number;
  nowSec: number;
  maxSec?: number;
  horizon?: boolean;
}): PoiClock {
  const maxSec = opts.maxSec ?? MAX_POI_STALENESS_SEC;
  const since = Math.max(0, opts.nowSec - (opts.lastPoiAt ?? opts.createdAtSec));
  const daysSince = since / 86_400;
  const daysLeft = (maxSec - since) / 86_400;
  const tone = poiTone(daysLeft);
  return {
    daysSince,
    daysLeft,
    tone,
    label: poiLabel(tone, daysLeft),
    horizon: opts.horizon !== false,
  };
}

export function needsPoiAttention(clock: PoiClock): boolean {
  return clock.tone !== 'fresh';
}
