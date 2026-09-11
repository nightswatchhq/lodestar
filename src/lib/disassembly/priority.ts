// Subgraph Disassembly — turning severity and exposure into one priority.
//
// A risk flag on a subgraph with 5 GRT signalled is trivia; the same flag with 400k GRT behind it
// is news. This is the arithmetic for that, and nothing else.
//
// Split out of `signal.ts`, which also fetched the signal by querying the nests directly. The
// client component needed only these three, so a pure ranking function was the last thing keeping
// a nest credential in this project's environment. kittiwake serves the signal now, inside its
// disassembly report.

import type { FlagLevel, SignalExposure } from './types';

/** GRT-signalled → exposure bucket. Thresholds tuned to The Graph's signal distribution. */
export function signalExposure(signalledGRT: number): SignalExposure {
  if (signalledGRT <= 0) return 'none';
  if (signalledGRT < 1_000) return 'low';
  if (signalledGRT < 50_000) return 'medium';
  return 'high';
}

export type RiskPriority = 'low' | 'medium' | 'high' | 'critical';

const EXPOSURE_RANK: Record<SignalExposure, number> = { none: 0, low: 1, medium: 2, high: 3 };

/**
 * Combine the worst flag severity with how much GRT is signalled.
 * Clean code (no warn/critical flags) is always low priority — nothing is at
 * risk no matter how much GRT rides on it. A critical flag on a heavily
 * signalled deployment is the only thing that reaches `critical`.
 */
export function riskPriority(worst: FlagLevel | 'none', exposure: SignalExposure): RiskPriority {
  if (worst === 'none' || worst === 'info') return 'low';
  const e = EXPOSURE_RANK[exposure];
  if (worst === 'warn') {
    return e >= 3 ? 'high' : e === 2 ? 'medium' : 'low';
  }
  // worst === 'critical'
  return e >= 3 ? 'critical' : e === 2 ? 'high' : 'medium';
}

/** Highest-severity flag level present, or 'none'. */
export function worstFlagLevel(levels: FlagLevel[]): FlagLevel | 'none' {
  if (levels.includes('critical')) return 'critical';
  if (levels.includes('warn')) return 'warn';
  if (levels.includes('info')) return 'info';
  return 'none';
}

/**
 * Best-effort current curation signal for a deployment ID (Qm…). Returns null
 * when no gateway access is configured or the query fails — signal is an
 * overlay, never load-bearing.
 */
