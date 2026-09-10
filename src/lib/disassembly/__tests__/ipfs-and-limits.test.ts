/**
 * IPFS access and the source-repo hint.
 *
 * Two small modules that guard real trust. The IPFS cap exists so a hostile manifest cannot
 * exhaust the function, and the source hint must degrade to null rather than throw, because a
 * share surface that throws takes a page down over a nicety.
 *
 * The verify rate limiter was the third, and went with source verification itself: it existed
 * because each build booted a microVM, and there is no build any more.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const cacheGet = vi.fn();
const cacheSet = vi.fn();
vi.mock('@/lib/cache', () => ({
  cacheGet: (...a: unknown[]) => cacheGet(...a),
  cacheSet: (...a: unknown[]) => cacheSet(...a),
}));

const hasNuthatch = vi.fn(() => true);
vi.mock('@/lib/nuthatch', () => ({ hasNuthatch: () => hasNuthatch() }));
const metadataFor = vi.fn<(ids: string[]) => Promise<Map<string, unknown>>>();
vi.mock('@/lib/subgraph-metadata', () => ({
  subgraphMetadataForDeployments: (ids: string[]) => metadataFor(ids),
}));
import { ipfsHashToBytes32 } from '@/lib/studio/ipfs';

import { IPFS_HASH_RE, ipfsCatText, ipfsCatBytes } from '../ipfs';
import { fetchSourceHint } from '../source-hint';

const HASH = 'QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG';
const fetchMock = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  hasNuthatch.mockReturnValue(true);
  metadataFor.mockResolvedValue(new Map());
  cacheGet.mockResolvedValue(null);
  cacheSet.mockResolvedValue(undefined);
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  delete process.env.REDIS_URL;
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.REDIS_URL;
});

describe('IPFS_HASH_RE', () => {
  it('accepts a CIDv0 and rejects everything else', () => {
    expect(IPFS_HASH_RE.test(HASH)).toBe(true);
    expect(IPFS_HASH_RE.test('Qmtooshort')).toBe(false);
    expect(IPFS_HASH_RE.test(`${HASH}extra`)).toBe(false);
    expect(IPFS_HASH_RE.test('bafybeigdyrztktx5')).toBe(false); // CIDv1
    expect(IPFS_HASH_RE.test('')).toBe(false);
    // Anchored at both ends: a hash embedded in a path is not a deployment id.
    expect(IPFS_HASH_RE.test(`/ipfs/${HASH}`)).toBe(false);
  });
});

describe('ipfsCatText', () => {
  it('fetches from the gateway with the hash as an encoded argument', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, text: async () => 'specVersion: 0.0.5' });

    await expect(ipfsCatText(HASH)).resolves.toBe('specVersion: 0.0.5');
    expect(String(fetchMock.mock.calls[0][0])).toBe(
      `https://ipfs.network.thegraph.com/api/v0/cat?arg=${HASH}`,
    );
  });

  it('throws with the status and hash when the gateway refuses', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 504, text: async () => '' });
    await expect(ipfsCatText(HASH)).rejects.toThrow(`IPFS gateway returned 504 for ${HASH}`);
  });

  it('passes an abort signal, so a hung gateway cannot wedge the request', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, text: async () => '' });
    await ipfsCatText(HASH);
    expect(fetchMock.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
  });
});

describe('ipfsCatBytes', () => {
  it('returns the artifact as bytes', async () => {
    const buf = new Uint8Array([0x00, 0x61, 0x73, 0x6d]).buffer;
    fetchMock.mockResolvedValue({ ok: true, status: 200, arrayBuffer: async () => buf });

    const out = await ipfsCatBytes(HASH);
    expect(out).toBeInstanceOf(Uint8Array);
    expect([...out]).toEqual([0x00, 0x61, 0x73, 0x6d]);
  });

  it('refuses an artifact over the size cap', async () => {
    // The cap is the whole point: a hostile manifest must not be able to exhaust the function.
    const huge = { byteLength: 33 * 1024 * 1024 } as ArrayBuffer;
    fetchMock.mockResolvedValue({ ok: true, status: 200, arrayBuffer: async () => huge });

    await expect(ipfsCatBytes(HASH)).rejects.toThrow(/bytes \(>33554432 cap\)/);
  });
});

describe('fetchSourceHint', () => {
  // The hint reads the gns nest's metadata hash and the IPFS document behind it (nuthatch#1160).
  const ID = ipfsHashToBytes32(HASH).toLowerCase();
  const withMeta = (metadata: unknown) => new Map([[ID, { subgraphId: 's', metadata }]]);

  it('returns null without querying when no nest is configured', async () => {
    hasNuthatch.mockReturnValue(false);
    await expect(fetchSourceHint(HASH)).resolves.toBeNull();
    expect(metadataFor).not.toHaveBeenCalled();
  });

  it('returns the repository and website when metadata carries them', async () => {
    metadataFor.mockResolvedValue(withMeta({ codeRepository: 'https://github.com/x/y', website: 'https://y.io' }));
    await expect(fetchSourceHint(HASH)).resolves.toEqual({
      codeRepository: 'https://github.com/x/y',
      website: 'https://y.io',
    });
    expect(metadataFor).toHaveBeenCalledWith([ID]);
  });

  it('normalises absent fields to null rather than undefined', async () => {
    metadataFor.mockResolvedValue(withMeta({}));
    await expect(fetchSourceHint(HASH)).resolves.toEqual({
      codeRepository: null,
      website: null,
    });
  });

  it.each([
    ['no entry for the deployment', new Map()],
    ['an entry with no metadata', withMeta(null)],
  ])('returns null when the nest has %s', async (_label, map) => {
    metadataFor.mockResolvedValue(map as Map<string, unknown>);
    await expect(fetchSourceHint(HASH)).resolves.toBeNull();
  });

  it('swallows a nest failure, because this is a nicety on a share surface', async () => {
    metadataFor.mockRejectedValue(new Error('nest down'));
    await expect(fetchSourceHint(HASH)).resolves.toBeNull();
  });
});
