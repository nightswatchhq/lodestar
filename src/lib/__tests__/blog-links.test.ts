/**
 * A link that leaves this origin must be a plain anchor.
 *
 * The blog moved to learn-thegraph.com and `next.config.ts` 308s `/blog/:slug` there. That is
 * correct for a bookmark and wrong for a Next `<Link>`: the router prefetches with an RSC `fetch`,
 * the fetch follows the redirect to another origin, and the browser blocks it for want of an
 * `Access-Control-Allow-Origin` header. On the home page that filled the console with CORS
 * failures and left the service worker resolving the FetchEvent with an error response.
 *
 * Nothing about that shows up as a failing build or a red test, which is why it needs one.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, statSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const SRC = join(process.cwd(), 'src');

/** Every .ts/.tsx under src, except the blog pages themselves - they are dead behind the redirect. */
function sourceFiles(dir = SRC): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (relative(SRC, full) === join('app', 'blog')) continue;
      out.push(...sourceFiles(full));
    } else if (/\.tsx?$/.test(entry) && !full.endsWith('blog-links.test.ts')) {
      out.push(full);
    }
  }
  return out;
}

const files = sourceFiles();

describe('links to the blog', () => {
  it('scans a real set of files, so an empty scan cannot pass as agreement', () => {
    expect(files.length).toBeGreaterThan(100);
  });

  it('never points at the redirecting /blog path', () => {
    const offenders: string[] = [];
    for (const f of files) {
      const src = readFileSync(f, 'utf8');
      // Any href or exported constant whose value is a bare /blog path. The redirect makes every
      // one of these a cross-origin hop, whether it is rendered by <Link> or <a>.
      // A real slug, not a `/blog/...` mention in prose: at least one slug character, and the
      // whole quoted value must be the path.
      for (const m of src.matchAll(/['"`](\/blog\/[a-z0-9][a-z0-9\-/]*)['"`]/g)) {
        offenders.push(`${relative(process.cwd(), f)}: ${m[1]}`);
      }
    }
    expect(
      offenders,
      'use the absolute https://learn-thegraph.com/dispatches/... URL and a plain <a>; a bare /blog path redirects across origins',
    ).toEqual([]);
  });
});
