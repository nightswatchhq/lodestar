// Regenerates src/lib/route-files.generated.ts from the filesystem.
// `migration.test.ts` fails if the committed list and the real directory disagree, so this is a
// convenience rather than the guarantee.
import { existsSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// An absent `src/app/api` is zero routes, not a crash. It crashed on 2026-09-12, the moment the
// last route file was deleted and the directory stopped existing, which is a generator that could
// only run while there was still work left to do.
function walk(dir, prefix = '/api') {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full, `${prefix}/${entry}`));
    else if (entry === 'route.ts') out.push(prefix);
  }
  return out;
}

const paths = walk(join(process.cwd(), 'src', 'app', 'api')).sort();
const header = `/**
 * Every \`route.ts\` under \`src/app/api\`, as the URL path it serves.
 *
 * Committed rather than walked at runtime, because \`src/\` is not in the serverless bundle: a
 * \`readdirSync\` here would find nothing on Vercel and report 0 routes, which is the shape of
 * absent data reading as complete.
 *
 * \`migration.test.ts\` walks the real directory and fails if this list disagrees with it in either
 * direction, so it cannot go stale without CI saying so. Regenerate with:
 *
 *     pnpm migration:routes
 */
export const ROUTE_FILES: readonly string[] = [
`;
writeFileSync(
  join(process.cwd(), 'src', 'lib', 'route-files.generated.ts'),
  header + paths.map((p) => `  '${p}',\n`).join('') + '];\n',
);
console.log(`${paths.length} routes written`);
