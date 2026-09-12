import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { KITTIWAKE_ROUTES } from '../kittiwake-routes.generated';

/**
 * Every `/api/…` path this app names must be a route kittiwake serves.
 *
 * This is the invariant the backend migration left behind. There is no second implementation to
 * diff against any more: the frontend is the only caller, kittiwake is the only server, and a call
 * site that outlives the route behind it now fails silently into whatever the caller does with a
 * 404. That has happened - a monitor was found probing a route deleted weeks earlier, and nothing
 * noticed because the failure went into a swallowed catch.
 *
 * The list comes from kittiwake's own OpenAPI document, which it generates from its router, so it
 * cannot describe a route that does not exist or omit one that does. Refresh it with
 * `node scripts/generate-kittiwake-routes.mjs`.
 */

const ROOTS = ['src/app', 'src/components', 'src/features', 'src/hooks', 'src/lib'];

/** Paths that are not kittiwake's and are not meant to be. */
const NOT_KITTIWAKES: Record<string, string> = {
  // Next serves this from `src/app/…/opengraph-image.tsx`, not from the API.
  '/api/og': 'a Next-rendered preview image, not a backend route',
};

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      // Test files name deliberately invented paths to exercise error handling, so they are the
      // one place where an unknown route is the point rather than a mistake.
      if (entry !== '__tests__') sourceFiles(full, out);
    } else if (
      /\.tsx?$/.test(entry) &&
      !/\.test\.tsx?$/.test(entry) &&
      // The inventory itself is a list of routes, not a list of call sites. Scanning it would
      // compare kittiwake's answer against itself and pass for the wrong reason.
      entry !== 'kittiwake-routes.generated.ts'
    ) {
      out.push(full);
    }
  }
  return out;
}

/**
 * Strip comments: a path mentioned in prose is not a call site.
 *
 * Block comments only where one opens a line, because `'/api/foghorn/**'` contains `/*` and a
 * naive stripper starts a comment inside that string literal and swallows the rest of the file.
 * That is what produced `/api/foghornpnl`, a path made of two unrelated strings.
 */
function code(src: string): string {
  return src.replace(/^[ \t]*\/\*[\s\S]*?\*\//gm, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

/**
 * Does kittiwake serve this path?
 *
 * The document writes a parameter as `{address}`, and the app writes a literal or builds one by
 * concatenation, so a template segment matches anything without a slash. A path the app builds up
 * to a prefix - `'/api/indexer/'` with the address appended at the call site - counts as naming the
 * route it is a prefix of.
 */
function servedBy(path: string): boolean {
  const clean = path.replace(/\/+$/, '');

  // The proxy's own wildcards, translated: `**` is a whole subtree, `*` is one segment. Such a
  // pattern is satisfied if any route kittiwake serves falls under it.
  if (clean.includes('*')) {
    const SUBTREE = 'SUBTREE';
    const rx = new RegExp(
      `^${clean
        .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
        .replace(/\*\*/g, SUBTREE)
        .replace(/\*/g, '[^/]+')
        .replace(SUBTREE, '.*')}$`,
    );
    return KITTIWAKE_ROUTES.some((route) => rx.test(route.replace(/\{[^}]*\}/g, 'x')));
  }

  return KITTIWAKE_ROUTES.some((route) => {
    if (route === clean) return true;
    const rx = new RegExp(
      `^${route.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\\{[^}]*\\\}/g, '[^/]+')}$`,
    );
    if (rx.test(clean)) return true;
    // `'/api/indexer/'` names `/api/indexer/{address}`: the call site appends the rest.
    return route.startsWith(`${clean}/`);
  });
}

const files = ROOTS.flatMap((r) => sourceFiles(r));
const named = new Map<string, string>();
for (const f of files) {
  // `*` is in the class because `migration.ts` holds proxy patterns - `/api/foghorn/**`,
  // `/api/indexer/*/pnl` - and those are paths this app routes, so they are worth checking too.
  // Leaving it out did not skip them: the match ran on past the closing quote and invented
  // `/api/foghornpnl` out of two separate strings.
  for (const m of code(readFileSync(f, 'utf8')).matchAll(/'(\/api\/[A-Za-z0-9/_{}*-]*)'/g)) {
    if (!named.has(m[1])) named.set(m[1], f);
  }
}

describe('the frontend and the routes kittiwake serves', () => {
  it('finds the call sites at all, so an empty scan cannot pass as agreement', () => {
    expect(files.length).toBeGreaterThan(0);
    expect(named.size, 'no /api/ path was found in any source file').toBeGreaterThan(20);
  });

  it('names no route kittiwake does not serve', () => {
    const unknown = [...named]
      .filter(([path]) => !(path in NOT_KITTIWAKES) && !servedBy(path))
      .map(([path, file]) => `${path}  (${file})`);

    expect(
      unknown,
      'these paths are fetched by the app and are not in kittiwake\'s router.\n' +
        'Either the route moved and the call site did not, or the inventory is stale:\n' +
        'refresh it with `node scripts/generate-kittiwake-routes.mjs`.',
    ).toEqual([]);
  });

  it('keeps the exemption list honest, so a path that comes back cannot sit in it', () => {
    const stale = Object.keys(NOT_KITTIWAKES).filter((p) => servedBy(p));
    expect(stale, 'kittiwake serves these now; they do not need exempting').toEqual([]);
  });
});
