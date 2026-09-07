/**
 * How much of the API kittiwake serves, and what is left.
 *
 * Deliberately served by Next rather than proxied: it reports on the migration, and a progress
 * endpoint that goes down with the thing it reports on is not much of a report. Same reasoning as
 * `/api/health`.
 *
 * The inventory comes from a committed route list rather than a directory walk, because `src/` is
 * not in the serverless bundle and a walk here would find nothing and publish "0 routes" as though
 * that were an answer. `migration.test.ts` walks the real directory in CI and fails if the
 * committed list has drifted, which is where the guarantee actually lives.
 */
import { NextResponse } from 'next/server';
import { buildInventory, summarise } from '@/lib/migration';
import { ROUTE_FILES } from '@/lib/route-files.generated';

export const dynamic = 'force-dynamic';

export async function GET() {
  const inventory = buildInventory(ROUTE_FILES);
  return NextResponse.json(
    { data: { summary: summarise(inventory), routes: inventory } },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
