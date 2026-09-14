import { describe, it, expect } from 'vitest';
import { denseDaily, labelWithNoCollections, utcDayLabel, utcDayStart, utcWindowDays } from '../day-series';

const NOW = Date.UTC(2026, 8, 14, 12, 0, 0);
const day = (y: number, m: number, d: number) => Date.UTC(y, m - 1, d) / 1000;

describe('day-series', () => {
  /** kittiwake's 30-day revenue window on 2026-09-14 ran 2026-08-16 to 2026-09-14. */
  it('counts a window the way kittiwake does: today included, oldest first', () => {
    const days = utcWindowDays(30, NOW);
    expect(days).toHaveLength(30);
    expect(days[0]).toBe(day(2026, 8, 16));
    expect(days.at(-1)).toBe(day(2026, 9, 14));
    expect(days.every((d, i) => i === 0 || d - days[i - 1] === 86_400)).toBe(true);
  });

  it('reads microseconds, milliseconds, seconds and dates as the same UTC day', () => {
    const d = day(2026, 8, 23);
    expect(utcDayStart(String(d * 1_000_000))).toBe(d);
    expect(utcDayStart(d * 1000 + 3_600_000)).toBe(d);
    expect(utcDayStart(d + 60)).toBe(d);
    expect(utcDayStart('2026-08-23')).toBe(d);
    expect(utcDayStart('not a day')).toBeNull();
  });

  it('labels the UTC day, not the viewer’s local one', () => {
    expect(utcDayLabel(day(2026, 8, 23))).toMatch(/^23 Aug/);
  });

  /** Two lump payments stay two bars with empty days between, never a slope. */
  it('zero-fills every day without a row and drops rows outside the window', () => {
    const rows = [
      { date: '2026-08-23', v: 5 },
      { date: '2026-08-24', v: 1 },
      { date: '2026-07-01', v: 99 },
    ];
    const points = denseDaily(
      30,
      rows,
      (r) => utcDayStart(r.date),
      (d, r) => ({ day: d, v: r?.v ?? 0 }),
      NOW,
    );
    expect(points).toHaveLength(30);
    expect(points.filter((p) => p.v > 0).map((p) => p.day)).toEqual([day(2026, 8, 23), day(2026, 8, 24)]);
    expect(points.reduce((s, p) => s + p.v, 0)).toBe(6);
  });

  it('says a day had no collections rather than a row of zeros', () => {
    expect(labelWithNoCollections('23 Aug', [{ value: 0 }, { value: 0 }])).toBe('23 Aug · no collections');
    expect(labelWithNoCollections('23 Aug', [{ value: 0 }, { value: 2 }])).toBe('23 Aug');
  });
});
