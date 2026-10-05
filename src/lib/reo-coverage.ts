/**
 * The Rewards Eligibility Oracle's subgraph coverage test, and how close an indexer is to it.
 *
 * From 6 October 2026 an active day needs a qualifying query on each of five subgraphs carrying at
 * least 500 GRT of signal, up from one. The count that decides it is per day, and kittiwake keeps
 * per-day, per-deployment rows. Two figures are shown: the window figure, deployments served at all
 * in the 30-day roll-up of which those over the floor, and a per-day count from
 * `/qos-qualifying-days`, which is still a ceiling because the rows carry no per-query latency or
 * freshness.
 */

import type { QosDeploymentRow, QualifyingDaysResponse } from '@/lib/contracts/indexer-qos';

export const REO_COVERAGE_CHANGE = '2026-10-06';
export const REO_SUBGRAPHS_BEFORE = 1;
export const REO_SUBGRAPHS_FROM = 5;
/**
 * The floor is in the Foundation's 22 September 2026 announcement and not, as of 24 September, in
 * the oracle repository's ELIGIBILITY_CRITERIA.md, so the panel names its source.
 */
export const REO_SIGNAL_FLOOR_GRT = 500;

export function coverageChanged(nowMs = Date.now()): boolean {
  return nowMs >= Date.parse(`${REO_COVERAGE_CHANGE}T00:00:00Z`);
}

export function subgraphsRequired(nowMs = Date.now()): number {
  return coverageChanged(nowMs) ? REO_SUBGRAPHS_FROM : REO_SUBGRAPHS_BEFORE;
}

export interface Coverage {
  /** Deployments that received at least one query in the window. */
  served: number;
  /** Of those, the ones carrying at least the floor in signal now. */
  qualifying: number;
  /** Served deployments whose signal is not in the lookup, so they count for nothing. */
  unknown: number;
}

/**
 * `signalGrt` is keyed by deployment id in whatever form the QoS rows carry, lowercased. Signal is
 * read now, not on the day the queries were served, so a deployment that has since lost its signal
 * drops out here as it would at the oracle.
 */
export function coverage(deployments: QosDeploymentRow[], signalGrt: Map<string, number>): Coverage {
  let served = 0;
  let qualifying = 0;
  let unknown = 0;
  for (const d of deployments) {
    if (!(d.queries > 0)) continue;
    served++;
    const signal = signalGrt.get(d.deployment_id.toLowerCase());
    if (signal === undefined) unknown++;
    else if (signal >= REO_SIGNAL_FLOOR_GRT) qualifying++;
  }
  return { served, qualifying, unknown };
}

export interface StripDay {
  date: string;
  /** Null for a day kittiwake did not send: not computed, or today when the nest did not answer. */
  count: number | null;
  partial: boolean;
  short: boolean | null;
}

const DAY_MS = 86_400_000;

/** One cell per UTC day of the oracle's window, oldest first, ending today. */
export function dailyStrip(answer: QualifyingDaysResponse, nowMs = Date.now()): StripDay[] {
  const byDate = new Map(answer.days.map((d) => [d.date, d]));
  const today = Math.floor(nowMs / DAY_MS);
  const cells: StripDay[] = [];
  for (let n = answer.window_days - 1; n >= 0; n--) {
    const date = new Date((today - n) * DAY_MS).toISOString().slice(0, 10);
    const d = byDate.get(date);
    cells.push({
      date,
      count: d ? d.count : null,
      partial: d?.partial ?? false,
      short: d ? d.count < REO_SUBGRAPHS_FROM : null,
    });
  }
  return cells;
}
