// @vitest-environment jsdom
/**
 * The inventory, and the three silent failures it replaces.
 *
 * Each of these was a real call in `dock/page.tsx`: a delete that ignored the response, a read that
 * turned a 500 into an empty list, and a read that swallowed everything. They are asserted as
 * failures here so that going back to the old shape breaks the suite rather than the product.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import {
  studioFetch,
  useBounties,
  useDeleteSubgraph,
  useDeployKey,
  useMySubgraphs,
  useSession,
} from '../api';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

function ok(body: unknown, status = 200) {
  return { ok: true, status, json: async () => body };
}
function bad(status: number, body: unknown = { error: 'nope' }) {
  return { ok: false, status, statusText: 'Server Error', json: async () => body };
}

beforeEach(() => mockFetch.mockReset());

describe('studioFetch', () => {
  it('sends the session cookie on every call', async () => {
    mockFetch.mockResolvedValueOnce(ok({}));
    await studioFetch('/api/studio/auth');
    expect(mockFetch.mock.calls[0][1]).toMatchObject({ credentials: 'include' });
  });

  it('throws on a failure rather than returning the error body as data', async () => {
    mockFetch.mockResolvedValueOnce(bad(500, { error: 'the database is unreachable' }));
    await expect(studioFetch('/api/studio/subgraphs')).rejects.toThrow('the database is unreachable');
  });

  it('falls back to the status when the body is not the handler’s error shape', async () => {
    // A proxy or a crash answers HTML, and `body?.error` would be undefined.
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 502,
      statusText: 'Bad Gateway',
      json: async () => {
        throw new Error('not json');
      },
    });
    await expect(studioFetch('/api/studio/subgraphs')).rejects.toThrow('502 Bad Gateway');
  });

  it('does not try to parse a 204', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, status: 204, json: async () => { throw new Error('no body'); } });
    await expect(studioFetch('/api/studio/subgraphs/1', { method: 'DELETE' })).resolves.toBeUndefined();
  });
});

describe('the failures that used to be silent', () => {
  it('a failed delete is an error, not a row quietly vanishing', async () => {
    // The call this replaces ignored the response and removed the row regardless, so the subgraph
    // came back on the next refresh and the user had been told it was gone.
    mockFetch.mockResolvedValueOnce(bad(403, { error: 'not yours' }));
    const { result } = renderHook(() => useDeleteSubgraph(), { wrapper });

    result.current.mutate(7);
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe('not yours');
  });

  it('a 500 on the bounty read is an error, not an empty list', async () => {
    // `json.bounties ?? []` turned a broken read into "no bounties", which is absent data
    // rendering as an answer.
    mockFetch.mockResolvedValueOnce(bad(500));
    const { result } = renderHook(() => useBounties({ deployment: 'Qm123' }), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data).toBeUndefined();
  });

  it('a failed deploy-key read is an error, not a shrug', async () => {
    mockFetch.mockResolvedValueOnce(bad(401));
    const { result } = renderHook(() => useDeployKey(), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});

describe('reads', () => {
  it('unwraps the subgraphs envelope', async () => {
    mockFetch.mockResolvedValueOnce(ok({ subgraphs: [{ id: 1, slug: 'a' }] }));
    const { result } = renderHook(() => useMySubgraphs(), { wrapper });
    await waitFor(() => expect(result.current.data).toHaveLength(1));
    expect(result.current.data?.[0].slug).toBe('a');
  });

  it('treats a signed-out session as an answer rather than a gap', async () => {
    mockFetch.mockResolvedValueOnce(ok({ address: null }));
    const { result } = renderHook(() => useSession(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.address).toBeNull();
  });

  it('scopes the bounty read to a deployment, encoded', async () => {
    mockFetch.mockResolvedValueOnce(ok({ bounties: [] }));
    const { result } = renderHook(() => useBounties({ deployment: 'Qm/weird id' }), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockFetch.mock.calls[0][0]).toBe('/api/studio/bounties?deployment=Qm%2Fweird%20id');
  });

  it('asks for every bounty when no deployment is given', async () => {
    mockFetch.mockResolvedValueOnce(ok({ bounties: [] }));
    const { result } = renderHook(() => useBounties(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockFetch.mock.calls[0][0]).toBe('/api/studio/bounties');
  });
});
