import { describe, expect, it } from 'vitest';

import { apiUrl, API_ORIGIN } from '../api-origin';

describe('where the API lives', () => {
  it('leaves the path alone when nothing is configured, which is the old behaviour', () => {
    // The test environment sets neither variable, so this is the same-origin default.
    expect(API_ORIGIN).toBe('');
    expect(apiUrl('/api/poi')).toBe('/api/poi');
  });

  it('keeps the leading slash, so a call site still reads as the route it asks for', () => {
    // `kittiwake-routes.test` and `one-typed-surface.test` both scan for the literal `'/api/…'`.
    // Splitting the path across the template would make both of them blind.
    expect(apiUrl('/api/indexers?first=10')).toContain('/api/indexers');
  });
});
