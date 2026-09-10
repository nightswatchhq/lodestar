/**
 * The committed search index matches the posts it was built from.
 *
 * It used to be served by `/api/blog/search-index`, a `force-static` route over files in this
 * repository. It is now `public/blog-search-index.json`, written by `pnpm blog:index` and by the
 * build. That trades a route for a file, and the risk that comes with it is a stale file: a post
 * added without regenerating would be missing from search with nothing to say so.
 *
 * The build regenerates it, so this failing means the committed copy is behind and a `pnpm
 * blog:index` is owed.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const { renderIndex } = (await import('../../../scripts/generate-blog-search-index.mjs')) as any;

describe('public/blog-search-index.json', () => {
  it('is current', () => {
    const committed = readFileSync(join(process.cwd(), 'public', 'blog-search-index.json'), 'utf8');
    expect(committed).toBe(renderIndex());
  });

  it('carries a body for every post', () => {
    const index = JSON.parse(
      readFileSync(join(process.cwd(), 'public', 'blog-search-index.json'), 'utf8'),
    );
    expect(Object.keys(index).length).toBeGreaterThan(0);
    for (const [slug, body] of Object.entries(index)) {
      expect(typeof body).toBe('string');
      expect((body as string).length, `${slug} has an empty body`).toBeGreaterThan(0);
    }
  });
});
