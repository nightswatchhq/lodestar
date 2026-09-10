/**
 * No component may state an absence it has not been told about.
 *
 * On 2026-09-10 eight pages, and then sixteen more, said "No Positions", "No Delegations Found",
 * "No open issues" and - on the monitoring page - "All clear. No indexers are currently serving bad
 * or no data", because react-query pauses retries when it believes the connection is gone. A paused
 * query is not fetching, so `isLoading` goes false with no data and every guard written as
 * `isLoading ? spinner : empty` falls through to the empty branch.
 *
 * The fix is `useQueryState`, which makes the four states impossible to conflate. This is the thing
 * that stops the pattern coming back: a file that both reads a query's loading flag and renders a
 * claim of absence has to show its working, either by using the hook or by appearing in the table
 * below with a reason.
 *
 * It is a text scan, so it is coarse by construction. It is not trying to prove correctness; it is
 * trying to make the return of a known defect noisy rather than silent.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOTS = ['src/app', 'src/components', 'src/features'];

/** Renders that assert nothing is there. Deliberately narrow: these are claims, not labels. */
const ABSENCE_CLAIM =
  /(No [A-Za-z][A-Za-z ]{0,30}(found|Found|yet|available)|Not Found|not found|No data available|All clear|no [a-z]+ positions|No measurements|No verdicts|No rated)/;

/** Reading a query's progress, which is where the conflation happens. */
const READS_LOADING = /\bisLoading\b|\bisPending\b/;

/** Any of the ways a file can show it has thought about the paused case. */
const TELLS_THEM_APART = /useQueryState|isUnavailable|fetchStatus/;

/**
 * Files that make an absence claim, read a loading flag, and are still correct.
 *
 * Each needs a reason a person checked, not a reason a regex accepted. Adding a line here is a
 * decision; leaving one out is a failing test.
 */
const CHECKED: Record<string, string> = {
  'src/app/payments/page.tsx':
    'the guard is `isError || !data`, so a paused read renders "Payment data is currently unavailable" and never reaches the three empty panels below it.',
  'src/components/charts/PortfolioChart.tsx':
    'takes `unavailable` as a prop; the decision lives at the call sites in delegators/[address] and profile.',
  'src/components/charts/SubgraphHistoryChart.tsx':
    'takes `unavailable` as a prop; the decision lives in HistorySection in subgraphs/[hash].',
  'src/components/ui/ProvisionsPanel.tsx':
    'takes `unavailable` as a prop; the decision lives at the call site in indexers/[address].',
};

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === '__tests__' || entry === 'node_modules') continue;
      out.push(...walk(full));
    } else if (entry.endsWith('.tsx')) {
      out.push(full);
    }
  }
  return out;
}

describe('a claim of absence needs an answer behind it', () => {
  const files = ROOTS.flatMap(walk);

  it('finds the components to check', () => {
    // A path change that silently emptied this list would make everything below vacuous.
    expect(files.length).toBeGreaterThan(100);
  });

  it('has no file claiming nothing is there while only knowing it is not loading', () => {
    const offenders = files.filter((f) => {
      const src = readFileSync(f, 'utf8');
      if (!ABSENCE_CLAIM.test(src) || !READS_LOADING.test(src)) return false;
      if (TELLS_THEM_APART.test(src)) return false;
      return !(f in CHECKED);
    });

    expect(offenders).toEqual([]);
  });

  it('keeps the checked table honest, so a fixed file cannot sit in it for ever', () => {
    const stale = Object.keys(CHECKED).filter((f) => {
      const src = readFileSync(f, 'utf8');
      return !ABSENCE_CLAIM.test(src) || !READS_LOADING.test(src) || TELLS_THEM_APART.test(src);
    });

    expect(stale).toEqual([]);
  });
});
