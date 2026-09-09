/**
 * The desktop sidebar and the mobile bottom nav have to agree, and nothing made them.
 *
 * They are two hand-maintained lists of the same routes in two files, which is the shape of the
 * defect behind nightswatchhq/kittiwake#23 and the reason `migration.ts` is one list rather than
 * two. It bit here on 2026-09-09: `/support` shipped into the sidebar and the footer, and mobile
 * users could not reach it at all, because adding a page means editing two files and only one of
 * them is in front of you. Checking then found `/sql`, `/verify` and `/qos` had been missing from
 * mobile for longer, and `/profile` from the sidebar, so it was three pages and not one.
 *
 * The two lists now hold the same twenty-six routes with no exceptions, which is the only state
 * this test can enforce without an allowlist that quietly grows. A page added to one file and not
 * the other fails here rather than reaching a phone as a route nobody can navigate to.
 */
import { describe, it, expect } from 'vitest';

import { navigation } from '../layout/Sidebar';
import { moreSections, tabs } from '../layout/BottomNav';

const sidebarHrefs = navigation.flatMap((s) => s.items.map((i) => i.href));
const mobileHrefs = [
  ...tabs.map((t) => t.href),
  ...moreSections.flatMap((s) => s.items.map((i) => i.href)),
];

describe('the two navigations', () => {
  it('finds both lists at all, so an empty import cannot pass as agreement', () => {
    // Two empty arrays agree perfectly, which is the way this file would fail silently.
    expect(sidebarHrefs.length).toBeGreaterThan(20);
    expect(mobileHrefs.length).toBeGreaterThan(20);
  });

  it('offers every sidebar page on mobile', () => {
    const missing = sidebarHrefs.filter((h) => !mobileHrefs.includes(h));
    expect(missing, 'in the sidebar and unreachable on a phone').toEqual([]);
  });

  it('offers every mobile page in the sidebar', () => {
    const missing = mobileHrefs.filter((h) => !sidebarHrefs.includes(h));
    expect(missing, 'on mobile and missing from the sidebar').toEqual([]);
  });

  it('lists each route once per navigation', () => {
    // `/indexers` is deliberately both a bottom tab and a More entry, so mobile is deduplicated
    // before counting; a repeat anywhere else is a paste that will drift on the next edit.
    expect(new Set(sidebarHrefs).size, 'a duplicate in the sidebar').toBe(sidebarHrefs.length);
    const mobileDupes = mobileHrefs.filter((h, i) => mobileHrefs.indexOf(h) !== i);
    expect(mobileDupes, 'duplicated on mobile beyond the Indexers tab').toEqual(['/indexers']);
  });

  it('has /support on both, which is the case that prompted this file', () => {
    expect(sidebarHrefs).toContain('/support');
    expect(mobileHrefs).toContain('/support');
  });
});
