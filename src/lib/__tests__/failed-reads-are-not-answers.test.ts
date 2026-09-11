/**
 * A response that failed must not be read as though it succeeded.
 *
 * The sibling of `empty-state-honesty.test.ts`, catching the half that one cannot see. That test
 * asks whether a component can tell "the query has not answered" from "the answer was empty". This
 * one asks something earlier: whether the failure ever reached the query at all.
 *
 * `fetch` resolves for a 500. A `queryFn` that goes straight to `res.json()` therefore returns
 * `json.data ?? []` for a server error, react-query records a **success**, and every downstream
 * check - `useQueryState` included - correctly reports a query that answered with nothing. The lie
 * is manufactured inside the fetcher, where nothing downstream can undo it. Four fetchers did this,
 * two of them the subgraph search box, which is the third time that box has claimed no results for
 * a reason that was not no results.
 *
 * `src/lib/api.ts` had the convention right the whole time: `if (!res.ok) throw`. What this stops is
 * the next inline `queryFn` written outside that file forgetting it.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOTS = ['src/app', 'src/components', 'src/features', 'src/hooks', 'src/lib'];

/**
 * Fetchers that read the body before the status and are right to.
 *
 * The narrow case: an endpoint whose body carries its own success flag, which the caller reads.
 */
const READS_ITS_OWN_FLAG: Record<string, string> = {
};

/**
 * Failures thrown away rather than handled.
 *
 * `.catch(() => {})` on a promise nobody awaits is the shape that let a posted bounty exist on
 * chain with no row on the board, and a deploy answer "success" having recorded nothing.
 */
const SWALLOW = /\.catch\(\(\)\s*=>\s*\{\}\)/;

/**
 * Swallows that are the right call, each with a reason somebody checked.
 *
 * The test is here to make the decision explicit, not to ban the pattern: some failures genuinely
 * do not matter, and saying so in one line is the difference between a decision and an oversight.
 */
const DELIBERATE: Record<string, string> = {
  'src/components/tables/IndexerTable.tsx':
    'two badges that render only when something is wrong. A failed probe shows nothing, which is also what a healthy indexer shows: the honest alternative would be a marker on most of eighty-seven rows during an outage, which is noise rather than information.',
  'src/app/blog/BlogIndex.tsx':
    'search keeps working on titles, excerpts and tags without the bodies; the degradation is invisible and harmless.',
  'src/app/scuttlebutt/page.tsx':
    'an admin-status probe. Failing leaves `isAdmin` false, which is the safe direction for a privilege check.',
  'src/hooks/useClickTracking.ts':
    'analytics. A reader must never see a dialog because a click could not be counted.',
  'src/lib/cache.ts':
    'two background refreshes whose rejection is handled by the `.finally` that clears the inflight entry; the caller already has its own answer.',
};

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === '__tests__') continue;
      out.push(...walk(full));
    } else if (entry.endsWith('.ts') || entry.endsWith('.tsx')) {
      out.push(full);
    }
  }
  return out;
}

/** Strips comments, so a file discussing the pattern is not accused of using it. */
function code(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

describe('a failure has to reach somebody', () => {
  const files = ROOTS.flatMap(walk);

  it('finds the modules to check', () => {
    expect(files.length).toBeGreaterThan(200);
  });

  it('has no fetcher that reads a body without checking the status first', () => {
    // `const r = await fetch(...)` followed by `r.json()` with no `r.ok` between them.
    const pattern = /const (\w+) = await fetch\([^;]*?\);\s*(?:\/\/[^\n]*\n\s*)*(?:const [^;]*?= )?await \1\.json\(\)|const (\w+) = await fetch\([^;]*?\);\s*return \2\.json\(\)/;

    const offenders = files.filter((f) => {
      const src = code(readFileSync(f, 'utf8'));
      const m = pattern.exec(src);
      if (!m) return false;
      const name = m[1] ?? m[2];
      // Any consultation of the status counts: `if (!res.ok) throw` and `status: res.ok ? …` are
      // both a decision, and the test is looking for the absence of one.
      if (new RegExp(`\\b${name}\\.ok\\b`).test(src)) return false;
      return !(f in READS_ITS_OWN_FLAG);
    });

    expect(offenders).toEqual([]);
  });

  it('has no failure dropped on the floor without a reason on record', () => {
    const offenders = files.filter((f) => SWALLOW.test(code(readFileSync(f, 'utf8'))) && !(f in DELIBERATE));
    expect(offenders).toEqual([]);
  });

  it('keeps the deliberate list honest, so a cleaned-up file cannot sit in it', () => {
    const stale = Object.keys(DELIBERATE).filter((f) => !SWALLOW.test(code(readFileSync(f, 'utf8'))));
    expect(stale).toEqual([]);
  });
});
