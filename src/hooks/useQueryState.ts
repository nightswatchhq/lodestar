'use client';

import type { UseQueryResult } from '@tanstack/react-query';

/**
 * A query's state, as the four things a reader actually needs told apart.
 *
 * On 2026-09-10 eight pages made a confident false claim because two of these had been collapsed
 * into one. React-query's `isLoading` is `isPending && isFetching`, and it **pauses** retries when
 * it believes the connection is gone. A paused query is not fetching, so `isLoading` goes false
 * while there is still no data, every `if (isLoading)` guard falls through, and the branch below it
 * says "Indexer Not Found", or "No provisions found", or - on somebody's own portfolio page - "No
 * Positions".
 *
 * The fix at each site was the same three lines, which is the shape of a thing that wants writing
 * once. This returns a discriminated union instead: there is no way to render the empty case
 * without the compiler making you say what happens when it could not be read.
 *
 * `idle` is separate on purpose. A query with `enabled: false` sits at `pending` for ever with
 * `fetchStatus: 'idle'`, and treating that as loading is how a panel gets a spinner that never
 * stops for a perfectly healthy reason.
 */
export type QueryState<T> =
  /** Disabled. Not asked for, so neither loading nor absent. */
  | { kind: 'idle' }
  /** In flight. A spinner is honest here and nowhere else. */
  | { kind: 'loading' }
  /** Retries are paused: the browser believes it is offline. No data, and none coming. */
  | { kind: 'unreachable' }
  /** The request was made and failed. */
  | { kind: 'failed'; error: Error }
  /** Answered. `data` may still be an empty list, and that is a real answer. */
  | { kind: 'ready'; data: T };

/**
 * Narrow a react-query result to [`QueryState`].
 *
 * Takes the whole result rather than destructured fields, because destructuring is exactly how the
 * distinction got lost in the first place.
 */
export function useQueryState<T>(query: UseQueryResult<T>): QueryState<T> {
  if (query.status === 'error') {
    return {
      kind: 'failed',
      error: query.error instanceof Error ? query.error : new Error(String(query.error)),
    };
  }
  if (query.status === 'success') {
    return { kind: 'ready', data: query.data };
  }
  // Pending. Which of the three pending states it is comes from `fetchStatus`, not from `status`.
  if (query.fetchStatus === 'paused') return { kind: 'unreachable' };
  if (query.fetchStatus === 'idle') return { kind: 'idle' };
  return { kind: 'loading' };
}

/**
 * True when a query cannot answer and will not without something changing.
 *
 * The common case at a call site that only needs "should I show the unavailable notice", without
 * switching on the whole union.
 */
export function isUnavailable<T>(state: QueryState<T>): boolean {
  return state.kind === 'failed' || state.kind === 'unreachable';
}

/** What to tell somebody, for the two states that need explaining. */
export function unavailableReason<T>(state: QueryState<T>): string | undefined {
  if (state.kind === 'unreachable') {
    return 'The connection appears to be down, so this could not be looked up.';
  }
  if (state.kind === 'failed') return state.error.message;
  return undefined;
}
