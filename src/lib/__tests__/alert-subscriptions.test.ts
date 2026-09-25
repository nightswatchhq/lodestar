import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadSaved, storeSaved } from '../alert-subscriptions';
import { createSubscription, deleteSubscription, fetchSubscription } from '../foghorn';

function memory(): Storage {
  const m = new Map<string, string>();
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => void m.set(k, v),
    removeItem: (k) => void m.delete(k),
    clear: () => m.clear(),
    key: () => null,
    length: 0,
  };
}

afterEach(() => vi.unstubAllGlobals());

describe('saved subscriptions', () => {
  it('round-trip per indexer, case-insensitively, and survive junk', () => {
    const s = memory();
    storeSaved(s, '0xABC', [{ id: 'a', token: 't' }]);
    expect(loadSaved(s, '0xabc')).toEqual([{ id: 'a', token: 't' }]);
    expect(loadSaved(s, '0xdef')).toEqual([]);
    s.setItem('lodestar.alerts.0xbad', '{not json');
    expect(loadSaved(s, '0xbad')).toEqual([]);
    s.setItem('lodestar.alerts.0xodd', JSON.stringify([{ id: 1 }, { id: 'b', token: 'u' }]));
    expect(loadSaved(s, '0xodd')).toEqual([{ id: 'b', token: 'u' }]);
    expect(loadSaved(undefined, '0xabc')).toEqual([]);
  });
});

describe('subscription requests', () => {
  it('create sends Foghorn its field names and surfaces its refusal', async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'i', manage_token: 'tok' }), { status: 201 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: 'The test post failed: the webhook answered 404.' }), { status: 422 }));
    vi.stubGlobal('fetch', fetch);
    const req = { indexer: '0xabc', webhookUrl: 'https://discord.com/api/webhooks/1/x', kinds: ['poi' as const], signalMovePct: 20 };
    await expect(createSubscription(req)).resolves.toEqual({ id: 'i', token: 'tok' });
    expect(fetch.mock.calls[0][0]).toMatch(/\/api\/foghorn\/alerts\/subscriptions$/);
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({
      indexer: '0xabc', webhook_url: 'https://discord.com/api/webhooks/1/x', kinds: ['poi'], signal_move_pct: 20,
    });
    await expect(createSubscription(req)).rejects.toThrow('The test post failed: the webhook answered 404.');
    fetch.mockResolvedValueOnce(new Response(JSON.stringify({ error: 'bad_request', message: 'not a POST endpoint' }), { status: 400 }));
    await expect(createSubscription(req)).rejects.toThrow('not a POST endpoint');
  });

  it('a subscription Foghorn no longer has reads as gone, and deleting it is not an error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: 'no such subscription' }), { status: 404 })));
    await expect(fetchSubscription({ id: 'i', token: 't' })).resolves.toBeNull();
    await expect(deleteSubscription({ id: 'i', token: 't' })).resolves.toBeUndefined();
  });
});
