import { describe, it, expect } from 'vitest';
import {
  MAX_POI_STALENESS_SEC,
  poiClock,
  poiTone,
  needsPoiAttention,
} from '../poi-clock';

const NOW = 1_700_000_000;

describe('poiClock', () => {
  it('is fresh when the last POI is recent', () => {
    const c = poiClock({ lastPoiAt: NOW - 3 * 86_400, createdAtSec: NOW - 10 * 86_400, nowSec: NOW });
    expect(c.tone).toBe('fresh');
    expect(c.daysSince).toBeCloseTo(3);
    expect(c.daysLeft).toBeCloseTo(25);
    expect(c.label).toMatch(/fresh/);
    expect(c.horizon).toBe(true);
  });

  it('falls back to creation when there is no POI yet', () => {
    const c = poiClock({ lastPoiAt: null, createdAtSec: NOW - 22 * 86_400, nowSec: NOW });
    expect(c.daysSince).toBeCloseTo(22);
    expect(c.tone).toBe('due');
    expect(needsPoiAttention(c)).toBe(true);
  });

  it('is close inside the last two days, and force-close once the window is open', () => {
    expect(poiTone(2)).toBe('close');
    expect(poiTone(2.1)).toBe('due');
    const closed = poiClock({ lastPoiAt: NOW - MAX_POI_STALENESS_SEC - 100, createdAtSec: NOW - 40 * 86_400, nowSec: NOW });
    expect(closed.tone).toBe('close');
    expect(closed.label).toBe('force-close window');
  });
});
