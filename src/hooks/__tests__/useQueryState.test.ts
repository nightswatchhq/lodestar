/**
 * The four states, and the two that were collapsed into one.
 *
 * Each case here corresponds to something that was on the site this morning: a paused query
 * rendering "Indexer Not Found", a disabled query rendering a spinner that never stops, and an
 * empty list being a real answer rather than a failure.
 */
import { describe, it, expect } from 'vitest';
import type { UseQueryResult } from '@tanstack/react-query';

import { isUnavailable, unavailableReason, useQueryState } from '../useQueryState';

// Only the three fields the narrowing reads. The real type carries forty.
function q<T>(partial: {
  status: 'pending' | 'error' | 'success';
  fetchStatus?: 'fetching' | 'paused' | 'idle';
  data?: T;
  error?: unknown;
}): UseQueryResult<T> {
  return {
    status: partial.status,
    fetchStatus: partial.fetchStatus ?? 'idle',
    data: partial.data,
    error: partial.error ?? null,
  } as unknown as UseQueryResult<T>;
}

describe('the pending states, which are three things and not one', () => {
  it('is loading while a request is actually in flight', () => {
    expect(useQueryState(q({ status: 'pending', fetchStatus: 'fetching' })).kind).toBe('loading');
  });

  it('is unreachable when retries are paused', () => {
    // The bug of 2026-09-10 in one line: this is pending, not fetching, has no data, and is not an
    // error. `isLoading` reports false and every guard built on it falls through.
    expect(useQueryState(q({ status: 'pending', fetchStatus: 'paused' })).kind).toBe('unreachable');
  });

  it('is idle when the query is disabled, rather than loading for ever', () => {
    expect(useQueryState(q({ status: 'pending', fetchStatus: 'idle' })).kind).toBe('idle');
  });
});

describe('the settled states', () => {
  it('carries the data when it is ready', () => {
    const s = useQueryState(q({ status: 'success', data: { a: 1 } }));
    expect(s).toEqual({ kind: 'ready', data: { a: 1 } });
  });

  it('treats an empty list as an answer, not an absence', () => {
    // The distinction the whole file exists for: nothing there is a fact; could not ask is not.
    const s = useQueryState(q<number[]>({ status: 'success', data: [] }));
    expect(s.kind).toBe('ready');
    expect(s.kind === 'ready' && s.data).toEqual([]);
  });

  it('carries the error when it failed', () => {
    const s = useQueryState(q({ status: 'error', error: new Error('503') }));
    expect(s.kind).toBe('failed');
    expect(s.kind === 'failed' && s.error.message).toBe('503');
  });

  it('wraps a non-Error rejection rather than handing back a string', () => {
    const s = useQueryState(q({ status: 'error', error: 'nest unreachable' }));
    expect(s.kind === 'failed' && s.error).toBeInstanceOf(Error);
    expect(s.kind === 'failed' && s.error.message).toBe('nest unreachable');
  });
});

describe('the helpers', () => {
  it('calls failed and unreachable unavailable, and nothing else', () => {
    expect(isUnavailable(useQueryState(q({ status: 'error', error: new Error('x') })))).toBe(true);
    expect(isUnavailable(useQueryState(q({ status: 'pending', fetchStatus: 'paused' })))).toBe(true);
    expect(isUnavailable(useQueryState(q({ status: 'pending', fetchStatus: 'fetching' })))).toBe(false);
    expect(isUnavailable(useQueryState(q({ status: 'pending', fetchStatus: 'idle' })))).toBe(false);
    expect(isUnavailable(useQueryState(q({ status: 'success', data: [] })))).toBe(false);
  });

  it('explains being offline without an error object to quote', () => {
    const s = useQueryState(q({ status: 'pending', fetchStatus: 'paused' }));
    expect(unavailableReason(s)).toMatch(/connection appears to be down/i);
  });

  it('quotes the error when there is one', () => {
    const s = useQueryState(q({ status: 'error', error: new Error('database: timeout') }));
    expect(unavailableReason(s)).toBe('database: timeout');
  });

  it('explains nothing when there is nothing wrong', () => {
    expect(unavailableReason(useQueryState(q({ status: 'success', data: 1 })))).toBeUndefined();
  });
});
