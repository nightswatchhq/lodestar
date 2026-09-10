import { NextResponse } from 'next/server';
import { cacheGet } from '@/lib/cache';
import type { ChainLagData } from '@/lib/chain-lag';

export async function GET() {
  const data = await cacheGet<ChainLagData>('lodestar:chain-lag');
  return NextResponse.json(
    { data: data ?? null },
    { headers: { 'Cache-Control': 'public, s-maxage=120, stale-while-revalidate=240' } },
  );
}
