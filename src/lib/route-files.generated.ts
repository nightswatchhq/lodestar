/**
 * Every `route.ts` under `src/app/api`, as the URL path it serves.
 *
 * Committed rather than walked at runtime, because `src/` is not in the serverless bundle: a
 * `readdirSync` here would find nothing on Vercel and report 0 routes, which is the shape of
 * absent data reading as complete.
 *
 * `migration.test.ts` walks the real directory and fails if this list disagrees with it in either
 * direction, so it cannot go stale without CI saying so. Regenerate with:
 *
 *     pnpm migration:routes
 */
export const ROUTE_FILES: readonly string[] = [
  '/api/data-services/query',
  '/api/file-issue',
  '/api/health',
  '/api/indexing-status/[hash]',
  '/api/issue-forms',
  '/api/migration',
  '/api/provider-liveness',
  '/api/sql/receipt',
];
