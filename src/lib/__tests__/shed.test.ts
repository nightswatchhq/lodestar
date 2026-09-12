import { describe, expect, it, vi, beforeEach } from 'vitest';

import { wasShed, fetchShedAware } from '../shed';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);
beforeEach(() => mockFetch.mockReset());

function res(body: unknown, status = 200): Response {
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status });
}

describe('telling a shed apart from a failure', () => {
  it('reads a 503 nest_busy as the gate working', () => {
    expect(wasShed(503, '{"error":"nest_busy","message":"nest busy"}')).toBe(true);
    expect(wasShed(429, '')).toBe(true);
  });

  /**
   * A 503 also means a retired nest and a deployment with no SQL tier. Retrying either is asking a
   * question that has already been answered, and `/ready` answering 503 over a retired nest is a
   * bug this repository has already had once.
   */
  it('does not read every 503 as a shed', () => {
    expect(wasShed(503, '{"error":"nest returned HTTP 410","retired":true}')).toBe(false);
    expect(wasShed(503, '{"available":false}')).toBe(false);
    expect(wasShed(500, 'nest_busy')).toBe(false);
  });
});

describe('asking a second time', () => {
  it('retries a shed request once and returns the second answer', async () => {
    mockFetch
      .mockResolvedValueOnce(res({ error: 'nest_busy' }, 503))
      .mockResolvedValueOnce(res({ data: [1, 2] }));
    const r = await fetchShedAware('/api/poi');
    expect(r.status).toBe(200);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  /**
   * Sustained shedding is a real capacity problem, and hiding it behind retries is how one becomes
   * an outage nobody saw coming.
   */
  it('lets a second shed through as the failure it is', async () => {
    mockFetch.mockResolvedValue(res({ error: 'nest_busy' }, 503));
    const r = await fetchShedAware('/api/poi');
    expect(r.status).toBe(503);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('does not retry a 503 that is not a shed', async () => {
    mockFetch.mockResolvedValue(res({ available: false }, 503));
    const r = await fetchShedAware('/api/sql/catalog');
    expect(r.status).toBe(503);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('does not retry anything else, success or failure', async () => {
    for (const [body, status] of [[{ data: 1 }, 200], [{ error: 'nope' }, 404], [{ error: 'boom' }, 500]] as const) {
      mockFetch.mockReset();
      mockFetch.mockResolvedValue(res(body, status));
      await fetchShedAware('/api/x');
      expect(mockFetch).toHaveBeenCalledTimes(1);
    }
  });

  /**
   * The body is read to classify the refusal, and a Response body can only be read once. If the
   * original were consumed rather than cloned, every non-shed 503 would reach its caller empty and
   * the route's own explanation would be lost.
   */
  it('leaves the returned body readable', async () => {
    mockFetch.mockResolvedValue(res({ available: false, datasets: [] }, 503));
    const r = await fetchShedAware('/api/sql/catalog');
    await expect(r.json()).resolves.toMatchObject({ available: false });
  });
});
