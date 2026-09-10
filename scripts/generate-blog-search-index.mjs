// Writes public/blog-search-index.json from the posts in the repo.
//
// This was `/api/blog/search-index`, a route marked `force-static` that read files committed to
// this repository and could only change on deploy. That is a build artefact wearing an API's
// clothes, and it was the cheapest of the routes standing between this repo and holding no API at
// all: nothing needed porting to kittiwake, because nothing about it was ever a backend.
//
// A test asserts the committed file matches the posts, the same guarantee `docs/MIGRATION.md` has.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

const { getSearchIndex } = await import('../src/lib/blog.ts');

export function renderIndex() {
  return `${JSON.stringify(getSearchIndex(), null, 0)}\n`;
}

if (process.argv[1]?.endsWith('generate-blog-search-index.mjs')) {
  writeFileSync(join(process.cwd(), 'public', 'blog-search-index.json'), renderIndex());
  console.log('wrote public/blog-search-index.json');
}
