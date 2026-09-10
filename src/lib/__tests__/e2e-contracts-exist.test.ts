/**
 * Every path the production monitor probes must still be a route this repo serves.
 *
 * `/api/vote` was deleted in #136 along with the two components that used it. The monitor kept
 * probing it, so `lodestar-e2e` went red on the merge and stayed red, reporting a 404 with a page
 * of Next's HTML in it every fifteen minutes until somebody read the alert. The route deletion was
 * correct; what was missing was anything tying the probe list to the routes.
 *
 * This is the same guarantee `migration.test.ts` gives for the migration inventory, pointed at
 * `scripts/e2e/contracts.mjs`. A deleted route now fails the suite on the branch that deletes it,
 * which is four hours and one Discord alert earlier than the monitor can manage.
 */
import { describe, it, expect } from 'vitest';

import { CONTRACTS, LIVENESS } from '../../../scripts/e2e/contracts.mjs';
import { ROUTE_FILES } from '../route-files.generated';
import { MIGRATED, BACKEND_ONLY } from '../migration';

/** `/api/foo?bar={address}` and `/api/foo/{hash}` both name the route `/api/foo`. */
function routeOf(probe: string): string {
  const path = probe.split('?')[0];
  // A `{placeholder}` segment is a dynamic route in the filesystem, which the generated list spells
  // `[param]`; comparing prefixes is enough to tell whether anything serves it at all.
  return path.replace(/\/\{[^}]+\}/g, '');
}

/** Whether anything serves this path: a Next route file, a kittiwake route, or a backend-only one. */
function isServed(path: string): boolean {
  const served = [...ROUTE_FILES, ...MIGRATED, ...BACKEND_ONLY];
  return served.some((known) => {
    const base = known.replace(/\/\[[^\]]+\]/g, '').replace(/\/$/, '');
    return base === path || path.startsWith(`${base}/`);
  });
}

describe('the production monitor probes routes that exist', () => {
  // `CONTRACTS` entries carry a name and required keys; `LIVENESS` is a bare list of paths.
  const probes: { path: string; name: string }[] = [
    ...(CONTRACTS as { path: string; name: string }[]),
    ...(LIVENESS as string[]).map((path) => ({ path, name: 'liveness' })),
  ];

  it('finds the probe list', () => {
    expect(probes.length).toBeGreaterThan(20);
  });

  it('has no probe pointing at a route nothing serves', () => {
    const orphans = probes
      .filter((c) => !isServed(routeOf(c.path)))
      .map((c) => `${c.name} -> ${c.path}`);

    expect(orphans).toEqual([]);
  });
});
