import { describe, expect, it } from 'vitest';
import {
  U64_MAX,
  paymentTypeLabel,
  periodLabel,
  ppmLabel,
  rangeLabel,
  thawListDisagrees,
  thawState,
} from '../provision-detail';
import type { ThawRequest } from '../queries';

const req = (over: Partial<ThawRequest>): ThawRequest => ({
  id: '0x01',
  shares: '1',
  tokens: '1',
  thawingUntil: 1_000,
  createdAt: 0,
  txHash: null,
  nonce: '0',
  valid: true,
  ...over,
});

describe('provision detail', () => {
  it('reads an unread value as unavailable, never as zero', () => {
    expect(ppmLabel(null)).toBeNull();
    expect(ppmLabel(undefined)).toBeNull();
    expect(periodLabel(null)).toBeNull();
    expect(rangeLabel(null, periodLabel)).toBeNull();
    expect(ppmLabel(0)).toBe('0.00%');
  });

  it('formats periods in days and the u64 sentinel as no limit', () => {
    expect(periodLabel('2419200')).toBe('28d');
    expect(periodLabel(90_000)).toBe('1d 1h');
    expect(periodLabel(U64_MAX)).toBe('no limit');
  });

  it('collapses a fixed range and opens an unbounded one', () => {
    expect(rangeLabel({ min: '2419200', max: '2419200' }, periodLabel)).toBe('28d');
    expect(rangeLabel({ min: '1209600', max: U64_MAX }, periodLabel)).toBe('14d or more');
    expect(rangeLabel({ min: '500000', max: '1000000' }, ppmLabel)).toBe('50.00% to 100.00%');
  });

  it('tells a ready request from a thawing, an invalidated and an unknown one', () => {
    expect(thawState(req({}), 2_000)).toEqual({ kind: 'ready' });
    expect(thawState(req({}), 400)).toEqual({ kind: 'thawing', secondsLeft: 600 });
    expect(thawState(req({ valid: false }), 2_000)).toEqual({ kind: 'invalidated' });
    expect(thawState(req({ thawingUntil: null }), 2_000)).toEqual({ kind: 'unknown' });
  });

  it('compares the listed requests with the chain only when the chain was read', () => {
    expect(thawListDisagrees(null, 2)).toBeNull();
    expect(thawListDisagrees(2, 2)).toBe(false);
    expect(thawListDisagrees(3, 2)).toBe(true);
  });

  it('names payment types', () => {
    expect(paymentTypeLabel(2)).toBe('Indexing rewards');
    expect(paymentTypeLabel(7)).toBe('Payment type 7');
  });
});
