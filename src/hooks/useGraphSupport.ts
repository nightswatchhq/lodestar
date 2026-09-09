'use client';

import { useQuery } from '@tanstack/react-query';
import type { SupportArchive } from '@/lib/graph-support';

const FIFTEEN_MINUTES = 1000 * 60 * 15;

async function fetchGraphSupport(): Promise<SupportArchive> {
  const response = await fetch('/api/support');
  if (!response.ok) {
    // The route answers 503 with a reason rather than an empty archive, so surface it.
    const body = await response.json().catch(() => null);
    throw new Error(body?.error ?? `graph-support fetch failed: ${response.status}`);
  }
  return response.json();
}

/**
 * The graph-support archive. No `refetchInterval`: the route caches for fifteen minutes and the
 * write-ups do not move, so polling would only spend GitHub's rate limit.
 */
export function useGraphSupport() {
  return useQuery({
    queryKey: ['graph-support'],
    queryFn: fetchGraphSupport,
    staleTime: FIFTEEN_MINUTES,
  });
}
