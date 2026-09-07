/**
 * The committed doc must be what the generator produces.
 *
 * A hand-maintained progress document drifts in one direction, and the drift is invisible because
 * a stale table still reads as a table. Generating it from `migration.ts` means the repo's account
 * and the dashboard's are the same account; this test is what stops the committed copy going stale
 * between regenerations. Run `pnpm migration:doc` if it fails.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const { renderDoc } = (await import('../../../scripts/generate-migration-doc.mjs')) as any;

describe('docs/MIGRATION.md', () => {
  it('is current', () => {
    const committed = readFileSync(join(process.cwd(), 'docs', 'MIGRATION.md'), 'utf8');
    expect(committed).toBe(renderDoc());
  });

  it('states a percentage and a remainder rather than only a percentage', () => {
    const committed = readFileSync(join(process.cwd(), 'docs', 'MIGRATION.md'), 'utf8');
    expect(committed).toMatch(/\d+ of \d+ routes/);
    expect(committed).toMatch(/\d+ left/);
  });
});
