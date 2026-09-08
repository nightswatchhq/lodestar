import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { isAnalyticsAuthorized } from '../analytics-auth';

function reqWith(header: string | null) {
  return {
    headers: {
      get(name: string) {
        return name.toLowerCase() === 'x-analytics-secret' ? header : null;
      },
    },
  };
}

describe('isAnalyticsAuthorized', () => {
  const ORIG = process.env.ANALYTICS_SECRET;
  beforeEach(() => {
    process.env.ANALYTICS_SECRET = 'super-secret-analytics-token';
  });
  afterEach(() => {
    if (ORIG === undefined) delete process.env.ANALYTICS_SECRET;
    else process.env.ANALYTICS_SECRET = ORIG;
  });

  // The regression from #113: the old guard was `if (secret && header !== secret)`, so an unset
  // variable disabled the check rather than denying. It was unset in production.
  it('fails CLOSED when ANALYTICS_SECRET is unset', () => {
    delete process.env.ANALYTICS_SECRET;
    expect(isAnalyticsAuthorized(reqWith('anything'))).toBe(false);
    expect(isAnalyticsAuthorized(reqWith(null))).toBe(false);
  });

  it('fails CLOSED when ANALYTICS_SECRET is empty string', () => {
    process.env.ANALYTICS_SECRET = '';
    expect(isAnalyticsAuthorized(reqWith(''))).toBe(false);
  });

  it('rejects a missing header', () => {
    expect(isAnalyticsAuthorized(reqWith(null))).toBe(false);
  });

  it('rejects a wrong secret', () => {
    expect(isAnalyticsAuthorized(reqWith('definitely-wrong'))).toBe(false);
  });

  it('rejects a secret of different length (no length-leak crash)', () => {
    expect(isAnalyticsAuthorized(reqWith('x'))).toBe(false);
    expect(isAnalyticsAuthorized(reqWith('super-secret-analytics-token-extra'))).toBe(false);
  });

  it('accepts the correct secret', () => {
    expect(isAnalyticsAuthorized(reqWith('super-secret-analytics-token'))).toBe(true);
  });
});
