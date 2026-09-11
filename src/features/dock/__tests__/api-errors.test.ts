/**
 * `studioFetch` reports what went wrong, whichever backend answered.
 *
 * The Dock's nine routes are moving to kittiwake one cutover at a time, and the two services do not
 * use the same error envelope: Next answers `{ error: "<message>" }`, kittiwake answers
 * `{ error: "<code>", message: "<message>" }` with a machine token like `bad_request` in `error`.
 *
 * Every one of those routes reports failure through this one function, so reading the wrong field
 * would turn every error message in the Dock into the word "bad_request" on the day it is proxied,
 * with every happy path still working. Found by sending the same bad payload to both services.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';

import { studioFetch } from '../api';

function answering(status: number, body: unknown) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    statusText: 'Bad Request',
    json: async () => body,
  });
}

afterEach(() => vi.unstubAllGlobals());

describe('the message a Dock failure shows', () => {
  it('reads the Next envelope', async () => {
    vi.stubGlobal('fetch', answering(400, { error: 'deploymentId is required' }));
    await expect(studioFetch('/api/x')).rejects.toThrow('deploymentId is required');
  });

  it('reads the kittiwake envelope, not the code beside it', async () => {
    vi.stubGlobal(
      'fetch',
      answering(400, { error: 'bad_request', message: 'deploymentId must be an IPFS CIDv0' }),
    );
    await expect(studioFetch('/api/x')).rejects.toThrow('deploymentId must be an IPFS CIDv0');
  });

  it('falls back to the status when the body is neither', async () => {
    vi.stubGlobal('fetch', answering(502, { unexpected: true }));
    await expect(studioFetch('/api/x')).rejects.toThrow('502');
  });

  it('falls back to the status when there is no body at all', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        json: async () => {
          throw new Error('not json');
        },
      }),
    );
    await expect(studioFetch('/api/x')).rejects.toThrow('500');
  });
});
