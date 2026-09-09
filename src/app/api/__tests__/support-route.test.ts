/**
 * `/api/support` contract, with GitHub mocked.
 *
 * The cases worth the most here are the failure paths. Folding an upstream error into an empty
 * array would let this route answer 200 with `{ issues: [] }`, the page would render "no open
 * issues", and a repository of thirty-three worked answers would read as a repository of none,
 * cached that way for fifteen minutes.
 *
 * So a failure serves the committed snapshot instead, and every one of these asserts the two
 * things that keeps honest: the issues are the snapshot's rather than an empty list, and `stale`
 * is set so the page says which it is showing.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Bypass Redis; `cached` here is the identity wrapper, which also means a throw inside the fetcher
// propagates exactly as it does in production, where nothing gets written on a rejection.
vi.mock('@/lib/cache', () => ({
  cached: (_key: string, _ttl: number, fetcher: () => Promise<unknown>) => fetcher(),
}));

vi.mock('@/lib/logger', () => ({
  log: { api: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } },
}));

import { GET } from '../support/route';
import snapshot from '@/data/graph-support.json';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

function ghIssue(overrides: Record<string, unknown> = {}) {
  return {
    number: 31,
    title: 'bad indexers: BadResponse(400) on every allocated indexer',
    html_url: 'https://github.com/nightswatchhq/graph-support/issues/31',
    state: 'open',
    labels: [{ name: 'area/gateway' }, { name: 'owner/edge-and-node' }],
    comments: 4,
    created_at: '2026-09-01T00:00:00Z',
    updated_at: '2026-09-08T00:00:00Z',
    ...overrides,
  };
}

function ok(body: unknown) {
  return {
    ok: true,
    status: 200,
    json: async () => body,
    headers: new Headers(),
  };
}

beforeEach(() => {
  mockFetch.mockReset();
});

describe('GET /api/support', () => {
  it('returns the issues with labels flattened to names', async () => {
    mockFetch.mockResolvedValueOnce(ok([ghIssue()]));

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.issues).toHaveLength(1);
    expect(body.issues[0]).toMatchObject({
      number: 31,
      state: 'open',
      comments: 4,
      labels: ['area/gateway', 'owner/edge-and-node'],
    });
    expect(typeof body.fetchedAt).toBe('string');
  });

  it('asks GitHub for closed issues too, since the archive is mostly closed ones', async () => {
    mockFetch.mockResolvedValueOnce(ok([ghIssue()]));
    await GET();
    expect(mockFetch.mock.calls[0][0]).toContain('state=all');
  });

  it('drops pull requests, which the issues endpoint returns alongside issues', async () => {
    mockFetch.mockResolvedValueOnce(
      ok([ghIssue(), ghIssue({ number: 32, pull_request: { url: 'x' } })]),
    );

    const body = await (await GET()).json();
    expect(body.issues.map((i: { number: number }) => i.number)).toEqual([31]);
  });

  it('serves the committed snapshot, flagged stale, when GitHub rejects the request', () => {
    // A 401 from an expired token is the case this exists for: it happened in production on
    // 2026-09-09 and left the page empty.
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({}),
      headers: new Headers({ 'x-ratelimit-remaining': '4999' }),
    });

    return GET().then(async (res) => {
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.stale).toBe(true);
      expect(body.reason).toContain('401');
      expect(body.issues.length).toBeGreaterThan(20);
      expect(body.fetchedAt).toBe(snapshot.capturedAt);
    });
  });

  it('serves the snapshot when GitHub returns 200 with no issues at all', async () => {
    // A clean result nobody expected. An empty archive is far more likely to be a broken request
    // than a repository that has lost all thirty-three of its issues.
    mockFetch.mockResolvedValueOnce(ok([]));

    const body = await (await GET()).json();
    expect(body.stale).toBe(true);
    expect(body.issues.length).toBeGreaterThan(20);
  });

  it('serves the snapshot when GitHub returns something that is not an array', async () => {
    mockFetch.mockResolvedValueOnce(ok({ message: 'Not Found' }));

    const body = await (await GET()).json();
    expect(body.stale).toBe(true);
  });

  it('never answers with an empty archive, whatever GitHub does', async () => {
    mockFetch.mockResolvedValueOnce(ok([]));
    const body = await (await GET()).json();
    expect(body.issues).not.toEqual([]);
  });

  it('does not mark a live answer stale', async () => {
    mockFetch.mockResolvedValueOnce(ok([ghIssue()]));
    const body = await (await GET()).json();
    expect(body.stale).toBeUndefined();
  });

  it('does not let a failure be cached', async () => {
    mockFetch.mockResolvedValueOnce(ok([]));
    expect((await (await GET()).json()).stale).toBe(true);

    // Second call reaches GitHub again rather than serving a stored fallback, so a rotated token
    // takes effect without waiting out the live path's fifteen minutes.
    mockFetch.mockResolvedValueOnce(ok([ghIssue()]));
    expect((await (await GET()).json()).stale).toBeUndefined();
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('follows pagination only while a full page came back', async () => {
    const fullPage = Array.from({ length: 100 }, (_, i) => ghIssue({ number: i + 1 }));
    mockFetch.mockResolvedValueOnce(ok(fullPage)).mockResolvedValueOnce(ok([ghIssue({ number: 101 })]));

    const body = await (await GET()).json();
    expect(body.issues).toHaveLength(101);
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(mockFetch.mock.calls[1][0]).toContain('page=2');
  });

  it('stops after one page when the repository fits in one', async () => {
    mockFetch.mockResolvedValueOnce(ok([ghIssue()]));
    await GET();
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});
