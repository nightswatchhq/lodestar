import { describe, it, expect } from 'vitest';
import { signalStakeRatio, ratioVsNetwork } from '../allocation-ratio';

describe('signalStakeRatio', () => {
  it('is signal over allocated stake', () => {
    expect(signalStakeRatio(200, 40)).toBe(5);
    expect(signalStakeRatio(0, 100)).toBe(0);
  });

  it('is null when nothing is allocated, not zero', () => {
    expect(signalStakeRatio(200, 0)).toBeNull();
  });
});

describe('ratioVsNetwork', () => {
  it('is how many times the network average the deployment is', () => {
    expect(ratioVsNetwork(0.0186, 0.0062)).toBeCloseTo(3);
  });
});
