import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Every request to `/api/…` is written down in one of three modules, and nowhere else.
 *
 * ## Why
 *
 * This started at 48 call sites spread over 23 files, each with its own URL building, its own idea
 * of the response shape, and its own opinion about what a failure meant. Working through them
 * found, in production: a Sync Warning badge reading **"NaN%"**, an indexer profile whose 582
 * allocations all rendered as IPFS hashes, a disputes panel that said **"This indexer has never
 * been disputed or slashed"** when the read failed, a search that said "no subgraphs found" when it
 * could not run, and a receipt download that would write an unsigned answer to a file called
 * `receipt-….json`.
 *
 * None of those were found by reading the code. They were found by making the shapes explicit, and
 * the shapes only became explicit because the requests moved somewhere a contract could be
 * attached to them. This test is what stops the 49th appearing.
 *
 * ## What it does not claim
 *
 * It checks where a request is written, not whether it is checked. `parseResponse` is the thing
 * that checks, `failed-reads-are-not-answers` is the thing that catches a swallowed failure, and
 * this is the thing that keeps both of them in a position to see anything at all.
 */

/**
 * The modules that *are* the typed surface.
 *
 * Three, because the two proxies have their own client: `foghorn.ts` funnels everything through
 * `foghornGet`, and `features/dock/api.ts` through `studioFetch`, which reads kittiwake's
 * `{ error, message }` envelope in preference to the bare `{ error }` the Next handlers sent.
 * Adding a fourth is a decision, not an accident, which is why they are listed rather than matched.
 */
const THE_TYPED_SURFACE = [
  'src/lib/api.ts',
  'src/lib/foghorn.ts',
  'src/features/dock/api.ts',
  // The one page that fetches on the server, where a relative URL is not a URL. It goes through
  // `serverApiUrl`, so it obeys the same switch as everything else.
  'src/app/support/[number]/page.tsx',
];

const ROOTS = ['src'];

/**
 * Two spellings, because there are now two ways to write a request.
 *
 * `fetch('/api/…')` is the original. `apiUrl('/api/…')` arrived with `api-origin.ts` when the
 * browser started calling `api.lodestar-dashboard.com` directly, and it is a way past a guard that
 * only knew the first - the same hole the swallow guard had when `.catch(() => {})` was rewritten
 * as `try`/`catch` and three call sites walked out of its sight without anything changing about
 * whether failures reached anybody.
 *
 * A refactor a guard cannot follow is a guard that expires quietly.
 */
const FETCH_CALL = /(?:fetch|apiUrl|serverApiUrl)\(\s*['"`]\/api\//g;

/**
 * Strip comments: a path mentioned in prose is not a call site.
 *
 * Block comments only where one opens a line. A string literal containing `/*` starts a comment
 * for a naive stripper, which then swallows the rest of the file - `kittiwake-routes.test.ts`
 * records that, and `scripts/rewrite-progress.mjs` reproduced it by not reading that first, and
 * counted a doc comment about a deleted request as a request.
 */
function code(src: string): string {
  return src.replace(/^[ \t]*\/\*[\s\S]*?\*\//gm, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      // Tests build their own requests on purpose; that is what a test of a fetcher does.
      if (entry !== '__tests__') sourceFiles(full, out);
    } else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

const files = ROOTS.flatMap((r) => sourceFiles(r));

describe('one typed surface', () => {
  it('finds the source files at all, so an empty scan cannot pass as agreement', () => {
    expect(files.length).toBeGreaterThan(100);
    // And the surface itself is among them, which is what makes the exemption meaningful.
    for (const f of THE_TYPED_SURFACE) expect(files).toContain(f);
  });

  it('is the only place a request to /api is written', () => {
    const offenders = files
      .filter((f) => !THE_TYPED_SURFACE.includes(f))
      .map((f) => ({ file: f, count: (code(readFileSync(f, 'utf8')).match(FETCH_CALL) ?? []).length }))
      .filter((x) => x.count > 0)
      .map((x) => `${x.file} (${x.count})`);

    expect(
      offenders,
      'these build their own request instead of calling a fetcher.\n' +
        'Add one to src/lib/api.ts with a parseResponse contract and call that: a cast is a claim\n' +
        'about a payload, and this repository has shipped several that were false.',
    ).toEqual([]);
  });

  it('keeps the exemption list honest, so a module that stops being a client cannot sit in it', () => {
    // Any `fetch(`, not `fetch('/api/…')`: `features/dock/api.ts` funnels every call through one
    // `studioFetch(url, init)` and so never writes a path literal, which is the whole point of it.
    for (const f of THE_TYPED_SURFACE) {
      expect(
        /\bfetch\(/.test(code(readFileSync(f, 'utf8'))),
        `${f} is exempt as a typed client and no longer makes any request; it should not be exempt`,
      ).toBe(true);
    }
  });
});
