import { describe, it, expect } from 'vitest';
import { accountHits, actionHits, indexerHits, isEnsName, pageHits, subgraphHits, subgraphSearchable } from '../omni-search';
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
    const hits = subgraphHits([result(HASH, 'Uniswap'), result(HASH, 'Uniswap'), result(null, 'Orphan')]);
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({ label: 'Uniswap', href: `/subgraphs/${HASH}` });
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

describe('pageHits', () => {
  const pages = [
    { label: 'Lodestar Oracle', href: '/qos' },
    { label: 'Foghorn', href: '/foghorn' },
    { label: 'POI Explorer', href: '/poi' },
    { label: 'GRT Flow', href: '/grt-flow' },
    { label: 'Indexers', href: '/indexers' },
    { label: 'Indexing Status', href: '/indexing' },
  ];

  it('finds a page by its label', () => {
    expect(pageHits(pages, 'foghorn').map((h) => h.href)).toEqual(['/foghorn']);
  });

  it('finds a page by its path when the label says something else', () => {
    expect(pageHits(pages, 'qos').map((h) => h.href)).toEqual(['/qos']);
    expect(pageHits(pages, 'grt flow').map((h) => h.href)).toEqual(['/grt-flow']);
  });

  it('finds a page by a keyword its label does not use', () => {
    expect(pageHits(pages, 'proof of').map((h) => h.href)).toEqual(['/poi']);
  });

  it('puts a label prefix above a label that merely contains the query', () => {
    expect(pageHits(pages, 'index').map((h) => h.href)).toEqual(['/indexers', '/indexing', '/poi']);
    expect(pageHits(pages, 'oracle').map((h) => h.href)).toEqual(['/qos']);
  });
});

describe('actionHits', () => {
  it('runs a subgraph preset by its label or its description', () => {
    const [hit] = actionHits('/', 'under-alloc');
    expect(hit.label).toBe('Under-allocated');
    expect(hit.href.startsWith('/subgraphs?')).toBe(true);
    expect(actionHits('/', 'query fees').map((h) => h.label)).toContain('High query volume');
  });

  it('offers a saved view by name', () => {
    const hits = actionHits('/', 'mine', [{ name: 'Mine on base', query: 'network=base' }]);
    expect(hits).toEqual([expect.objectContaining({ label: 'Mine on base', href: '/subgraphs?network=base' })]);
  });

  it("opens a tab of the indexer being viewed, and only there", () => {
    const tabs = (path: string) => actionHits(path, 'alloc').filter((h) => h.detail === 'this indexer');
    expect(tabs(`/indexers/${ADDR}`).map((h) => h.href)).toEqual([`/indexers/${ADDR}?tab=allocations`]);
    expect(tabs('/subgraphs')).toEqual([]);
  });

  it("copies the page's address or hash rather than navigating", () => {
    expect(actionHits(`/delegators/${ADDR}`, 'copy')).toEqual([expect.objectContaining({ copy: ADDR, label: "Copy this page's address" })]);
    expect(actionHits(`/subgraphs/${HASH}`, 'copy')[0]).toMatchObject({ copy: HASH, label: "Copy this page's hash" });
    expect(actionHits('/indexers', 'copy')).toEqual([]);
  });
});

describe('isEnsName', () => {
  it('accepts plain .eth names and nothing else', () => {
    expect(isEnsName('Vitalik.eth')).toBe(true);
    expect(isEnsName('sub.name-1.eth')).toBe(true);
    for (const bad of ['vitalik', 'vitalik.com', '.eth', 'vitalík.eth']) expect(isEnsName(bad)).toBe(false);
  });
});
