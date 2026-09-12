'use client';

import { useQuery } from '@tanstack/react-query';
import { fetchGraphSupport } from '@/lib/api';

const FIFTEEN_MINUTES = 1000 * 60 * 15;

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
