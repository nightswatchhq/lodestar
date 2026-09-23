import { describe, it, expect } from 'vitest';
import { accountHits, indexerHits, subgraphHits, subgraphSearchable } from '../omni-search';
import type { SubgraphSearchResult } from '../contracts/subgraph-search';

const ADDR = '0x4e5c87772c29381bcabc58c3f182b6633b5a274a';
const HASH = 'QmaqdZ8KqmW8PUfBAXpAJ4c1cHdLDNHfMZs1kzGrGDsb9r';

const indexers = [
  { id: ADDR, name: null, ensName: null },
  { id: '0x0fd8fd1dc8162148cb9413062fe6c6b144335dbf', name: 'GraphOps', ensName: 'graphops.eth' },
  { id: '0xedca8740873152ff30a2696add66d1ab41882beb', name: null, ensName: 'pinax.eth' },
  { id: '0x1111111111111111111111111111111111111111', name: 'Opsmith', ensName: null },
];

const result = (hash: string | null, name: string | null): SubgraphSearchResult => ({
  id: `sg-${hash}`,
  metadata: name ? { displayName: name, description: null } : null,
  currentVersion: hash
    ? { subgraphDeployment: { ipfsHash: hash, signalledTokens: '0', stakedTokens: '0' } }
    : null,
});

describe('subgraphSearchable', () => {
  it('skips a partial address, which the route would search as a name', () => {
    expect(subgraphSearchable('0x4e5c')).toBe(false);
    expect(subgraphSearchable(ADDR)).toBe(true);
  });

  it('skips a Qm prefix too short for the hash lookup', () => {
    expect(subgraphSearchable('Qmaq')).toBe(false);
    expect(subgraphSearchable('QmaqdZ8K')).toBe(true);
  });

  it('asks for names of two characters or more', () => {
    expect(subgraphSearchable('u')).toBe(false);
    expect(subgraphSearchable('uniswap')).toBe(true);
  });
});

describe('indexerHits', () => {
  it('matches an address prefix, case-insensitively', () => {
    const hits = indexerHits(indexers, '0x4E5C');
    expect(hits.map((h) => h.href)).toEqual([`/indexers/${ADDR}`]);
  });

  it('labels an unnamed indexer by its shortened address', () => {
    expect(indexerHits(indexers, ADDR)[0].label).toBe('0x4e5c...274a');
  });

  it('matches the ENS name when there is no verified name', () => {
    expect(indexerHits(indexers, 'pinax')[0].label).toBe('pinax.eth');
  });

  it('ranks a name that starts with the query above one that merely contains it', () => {
    expect(indexerHits(indexers, 'ops').map((h) => h.label)).toEqual(['Opsmith', 'GraphOps']);
  });

  it('does not match an address by substring when the query is a name', () => {
    expect(indexerHits(indexers, '4e5c')).toEqual([]);
  });
});

describe('subgraphHits', () => {
  it('links each deployment once and skips results without one', () => {
    const hits = subgraphHits('uni', [result(HASH, 'Uniswap'), result(HASH, 'Uniswap'), result(null, 'Orphan')]);
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({ label: 'Uniswap', href: `/subgraphs/${HASH}` });
  });

  it('offers a pasted hash even when the search does not know it', () => {
    expect(subgraphHits(HASH, [])[0].href).toBe(`/subgraphs/${HASH}`);
  });

  it('does not duplicate a pasted hash the search did find', () => {
    const hits = subgraphHits(HASH, [result(HASH, 'Uniswap')]);
    expect(hits.map((h) => h.label)).toEqual(['Uniswap']);
  });
});

describe('accountHits', () => {
  it('offers the portfolio pages for a full address only', () => {
    expect(accountHits(ADDR.toUpperCase().replace('0X', '0x')).map((h) => h.href)).toEqual([
      `/delegators/${ADDR}`,
      `/curators/${ADDR}`,
    ]);
    expect(accountHits('0x4e5c')).toEqual([]);
  });
});
