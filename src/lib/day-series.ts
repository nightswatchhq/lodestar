/**
 * Daily series over whole UTC days.
 *
 * kittiwake answers only the days an event landed on. A chart fed those days directly compresses
 * time and draws a slope between two lump payments that the chain never contained, so every chart
 * of daily amounts goes through `denseDaily` first.
 */

const DAY = 86_400;

/**
 * Day starts, in seconds, for a window that ends today and includes it, counted the way kittiwake
 * counts it: the first day is `floor(now / 86400) - (days - 1)`.
 */
export function utcWindowDays(windowDays: number, nowMs: number = Date.now()): number[] {
  const today = Math.floor(nowMs / 1000 / DAY);
  const n = Math.max(1, Math.floor(windowDays));
  return Array.from({ length: n }, (_, i) => (today - (n - 1) + i) * DAY);
}

/** The UTC day start, in seconds, of a microsecond, millisecond or second timestamp, or of `YYYY-MM-DD`. */
export function utcDayStart(value: string | number): number | null {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const ms = Date.parse(`${value}T00:00:00Z`);
    return Number.isNaN(ms) ? null : ms / 1000;
  }
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  const seconds = n > 1e15 ? n / 1e6 : n > 1e12 ? n / 1e3 : n;
  return Math.floor(seconds / DAY) * DAY;
}

/** `14 Sept`, for the UTC day, whatever the viewer's time zone. */
export function utcDayLabel(daySeconds: number): string {
  return new Date(daySeconds * 1000).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    timeZone: 'UTC',
  });
}

/** One point per day of the window, oldest first; a day without a row gets `toPoint(day, undefined)`. */
export function denseDaily<R, P>(
  windowDays: number,
  rows: readonly R[],
  dayOf: (row: R) => number | null,
  toPoint: (day: number, row: R | undefined) => P,
  nowMs: number = Date.now(),
): P[] {
  const byDay = new Map<number, R>();
  for (const row of rows) {
    const day = dayOf(row);
    if (day != null) byDay.set(day, row);
  }
  return utcWindowDays(windowDays, nowMs).map((day) => toPoint(day, byDay.get(day)));
}

/** A tooltip label that says so when nothing was paid that day, rather than showing a row of zeros. */
export function labelWithNoCollections(
  label: unknown,
  payload: ReadonlyArray<{ value?: unknown }> | undefined,
): string {
  const sum = (payload ?? []).reduce((s, p) => s + (Number(p.value) || 0), 0);
  return sum > 0 ? String(label) : `${String(label)} · no collections`;
}
