// Moved from @/lib/contracts/developer-activity when the rollback handler was deleted. See README.md.

export interface WeekBucket {
  /** Monday of the ISO week, YYYY-MM-DD */
  weekStart: string;
  /** Subgraphs published that week */
  count: number;
  /** Running total of subgraphs published from the window start through this week */
  cumulative: number;
  /** True for the current, still-in-progress week (incomplete — don't read its count as a trend) */
  partial: boolean;
}

export interface DeveloperActivityResponse {
  /** Weekly published-subgraph counts, oldest → newest */
  weeks: WeekBucket[];
  /** Months of history covered */
  windowMonths: number;
  /** Total subgraphs published within the window */
  totalInWindow: number;
  /** Published in the most recent COMPLETE week (the partial current week is excluded) */
  lastWeekCount: number;
  /** Week-over-week change (%) between the last two complete weeks, null when the prior week is empty */
  weekOverWeekPct: number | null;
  /** Dataset that served this payload. */
  source: 'nuthatch';
}
