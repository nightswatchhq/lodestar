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
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
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
 * Failures thrown away rather than handled, in two spellings that need opposite treatment.
 *
 * `.catch(() => {})` on a promise nobody awaits is the shape that let a posted bounty exist on
 * chain with no row on the board, and a deploy answer "success" having recorded nothing. It is
 * matched against comment-stripped source, because this codebase quotes that exact string in doc
 * comments describing bugs it has already fixed, and a mention in prose is not a call site.
 *
 * A bare `catch { }` is the same fault and was not matched at first, so rewriting three call sites
 * from one spelling to the other moved every one of them out of this test's sight while changing
 * nothing about whether the failure reached anybody. It is matched against **raw** source, because
 * a comment inside the catch is precisely the reason on record this test is named for: stripping
 * it first turns `catch { /* storage may be unavailable *\/ }` into `catch { }` and reports four
 * documented decisions as oversights.
 */
const SWALLOW_PROMISE = /\.catch\(\(\)\s*=>\s*\{\}\)/;
const SWALLOW_BLOCK = /\bcatch\s*(?:\([^)]*\))?\s*\{\s*\}/;

function swallowsSilently(src: string): boolean {
  return SWALLOW_PROMISE.test(code(src)) || SWALLOW_BLOCK.test(src);
}

/**
 * Swallows that are the right call, each with a reason somebody checked.
 *
 * The test is here to make the decision explicit, not to ban the pattern: some failures genuinely
 * do not matter, and saying so in one line is the difference between a decision and an oversight.
 */
const DELIBERATE: Record<string, string> = {
  'src/app/blog/BlogIndex.tsx':
    'search keeps working on titles, excerpts and tags without the bodies; the degradation is invisible and harmless.',
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
    // Not a floor on how large the repo is. This was `> 200` and the repo has been shrinking on
    // purpose all week, so it became an assertion that the migration is unfinished - the third one
    // of those found today. What it guards is the walk: a broken path finds nothing and makes every
    // check below vacuously true.
    expect(files.length).toBeGreaterThan(0);
    expect(files.some((f) => f.endsWith('.tsx'))).toBe(true);
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

  /**
   * The same fault in the shape the test above could not see.
   *
   * `fetch(url).then((r) => r.json())` never binds a response to a name, so the pattern above -
   * which keys on `const r = await fetch(…)` - walked straight past it. Three components were
   * written that way and none of them checked a status: a 500 became the error envelope parsed as
   * data, `available` came back undefined, and the panel returned null. The read failed and the
   * page showed nothing, with nothing anywhere saying so.
   *
   * There is no name to look for an `.ok` on here, and that is the point: this form cannot check a
   * status without first keeping the response, so finding it at all is finding the fault.
   */
  it('has no fetcher that throws the response away before looking at it', () => {
    const inline = /fetch\([^)]*\)\s*\.then\(\s*\(?\s*\w+\s*\)?\s*=>\s*\w+\.json\(\)/;

    const offenders = files.filter((f) => inline.test(code(readFileSync(f, 'utf8'))));

    expect(
      offenders,
      'these read a body straight out of a `.then` without keeping the response, so nothing can ' +
        'have looked at its status. Route them through `lib/api.ts`, which checks.',
    ).toEqual([]);
  });

  it('has no failure dropped on the floor without a reason on record', () => {
    // **Raw source, not `code()`.** Every other check here strips comments first, because a path
    // named in prose is not a call site. This one is the opposite: a comment inside the catch is
    // precisely the reason on record that the test is named for, and stripping it first turns
    // `catch { /* storage may be unavailable */ }` into `catch { }` and reports four documented
    // decisions as oversights.
    const offenders = files.filter(
      (f) => swallowsSilently(readFileSync(f, 'utf8')) && !(f in DELIBERATE),
    );
    expect(offenders).toEqual([]);
  });

  it('keeps the deliberate list honest, so a cleaned-up file cannot sit in it', () => {
    // A deleted file counts as stale rather than throwing. It used to throw ENOENT from inside the
    // filter, which reports a missing file as a crash in the test harness rather than as the thing
    // it is: an entry excusing something that no longer exists.
    const stale = Object.keys(DELIBERATE).filter((f) => {
      if (!existsSync(f)) return true;
      return !swallowsSilently(readFileSync(f, 'utf8'));
    });
    expect(stale).toEqual([]);
  });
});
