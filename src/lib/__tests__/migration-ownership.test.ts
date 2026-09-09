import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

/**
 * Every table a migration creates must be handed to the application role in the same file.
 *
 * `clickthrough_events` was created as the superuser and never handed over, so it was owned by
 * `postgres` while the app connected as `lodestar`. Every insert was refused with 42501, the writer
 * was fire-and-forget so nothing surfaced it, and the table was still empty when it was found
 * months later (#113). Nothing in the repo would have caught that, because nothing checked.
 *
 * This is the check. It runs without a database: it reads the SQL and asserts the rule, which is the
 * only part that can be enforced before the thing is run against production.
 */

const DIR = join(process.cwd(), 'scripts');
const APP_ROLE = 'lodestar';

const files = readdirSync(DIR)
  .filter((f) => f.endsWith('.sql'))
  // The sweep reassigns whatever it finds by querying the catalogue, so it names no tables and has
  // nothing to match against.
  .filter((f) => f !== 'fix-ownership.sql');

function tablesIn(sql: string): string[] {
  const created = [...sql.matchAll(/CREATE TABLE\s+(?:IF NOT EXISTS\s+)?(\w+)/gi)].map((m) => m[1]);
  return [...new Set(created)];
}

function ownedIn(sql: string): string[] {
  return [...sql.matchAll(/ALTER TABLE\s+(\w+)\s+OWNER TO\s+(\w+)/gi)]
    .filter((m) => m[2] === APP_ROLE)
    .map((m) => m[1]);
}

describe('migration scripts assign table ownership', () => {
  it('finds the scripts at all, so an empty sweep cannot pass for a clean one', () => {
    expect(files.length).toBeGreaterThan(5);
  });

  for (const file of files) {
    const sql = readFileSync(join(DIR, file), 'utf8');
    const created = tablesIn(sql);
    if (created.length === 0) continue;

    it(`${file} hands every table it creates to ${APP_ROLE}`, () => {
      const owned = new Set(ownedIn(sql));
      const missing = created.filter((t) => !owned.has(t));
      expect(
        missing,
        `${file} creates ${missing.join(', ')} without an ALTER TABLE ... OWNER TO ${APP_ROLE}. ` +
          'A table owned by the superuser is invisible to the app and fails at runtime, not here.',
      ).toEqual([]);
    });
  }
});
