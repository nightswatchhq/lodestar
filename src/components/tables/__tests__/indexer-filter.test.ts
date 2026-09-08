import { describe, it, expect } from 'vitest';
import { nameAddressFilter } from '../IndexerTable';

/**
 * The search box on `/indexers` threw `Cannot read properties of null (reading 'toLowerCase')` on the
 * first keystroke, inside TanStack's `filterFn` - so the whole table unmounted into an error
 * boundary and the user saw "Something went wrong" rather than a bad search result.
 *
 * `name` is null for **97 of 97** mainnet indexers: none set `defaultDisplayName`, and kittiwake
 * sends no name field at all. So this is the ordinary case, not an edge one, and the comment above
 * the filter had said as much since it was written.
 */
const row = (over: Partial<{ name: string | null; address: string; url: string | null }> = {}) =>
  ({ original: { name: null, address: '0x4e5c87772c29381bcabc58c3f182b6633b5a274a', url: null, ...over } }) as never;

describe('nameAddressFilter', () => {
  it('does not throw when the indexer has no display name', () => {
    // The regression. Before the guard this threw rather than returning a boolean.
    expect(() => nameAddressFilter(row(), 'x', '4e5c', undefined as never)).not.toThrow();
  });

  it('still matches on address when the name is null', () => {
    expect(nameAddressFilter(row(), 'x', '4e5c', undefined as never)).toBe(true);
    expect(nameAddressFilter(row(), 'x', 'zzzz', undefined as never)).toBe(false);
  });

  it('matches on name when there is one', () => {
    expect(nameAddressFilter(row({ name: 'GraphOps' }), 'x', 'graphops', undefined as never)).toBe(true);
  });

  it('matches on url, and tolerates a null one', () => {
    expect(nameAddressFilter(row({ url: 'https://indexer.example' }), 'x', 'example', undefined as never)).toBe(true);
    expect(() => nameAddressFilter(row({ url: null }), 'x', 'example', undefined as never)).not.toThrow();
  });
});
