import { describe, it, expect } from 'vitest';
import { emptySearchMessage, isNameQuery } from '@/lib/search-backlog';

describe('search-backlog', () => {
  // kittiwake#8. The whole point of the field is that these three are not the same answer.
  it('says "no such subgraph" only when nothing is waiting to be indexed', () => {
    const m = emptySearchMessage('uniswap', 0);
    expect(m).toBe('No subgraphs found for “uniswap”.');
    expect(m).not.toMatch(/yet/);
  });

  it('says "not yet", with the number, while documents are still unfetched', () => {
    const m = emptySearchMessage('uniswap', 1234);
    expect(m).toMatch(/yet\./);
    expect(m).toContain('1,234');
    expect(m).toContain('documents are');
  });

  it('does not claim either when no warm run has finished', () => {
    for (const backlog of [null, undefined]) {
      const m = emptySearchMessage('uniswap', backlog);
      expect(m).toMatch(/yet\./);
      expect(m).toContain('still being built');
    }
  });

  // A count of one must not read as "1 documents are".
  it('agrees with itself about one document', () => {
    expect(emptySearchMessage('uniswap', 1)).toContain('1 subgraph document is');
  });

  // A hash or an address is answered from the chain's own data, where nothing is warming. The
  // caveat would be true and irrelevant, which is its own kind of wrong.
  it('offers no backlog caveat for a hash or an address', () => {
    const hash = 'QmYA8AwSLGV1bLPZeDNqPUmZQhCC5rBjAqjCPZBpDFhCJi';
    const addr = '0x090f7382f9ea85c733cd501f4d87f16cb5b83ed3';
    expect(isNameQuery(hash)).toBe(false);
    expect(isNameQuery(addr)).toBe(false);
    expect(emptySearchMessage(hash, 999)).not.toMatch(/yet/);
    expect(emptySearchMessage(addr, 999)).not.toMatch(/yet/);
    expect(isNameQuery('uniswap')).toBe(true);
  });

  it('handles an empty query without an empty pair of quotes', () => {
    expect(emptySearchMessage('  ', 0)).toBe('No subgraphs found.');
  });
});
