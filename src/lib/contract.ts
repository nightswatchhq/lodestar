/**
 * Parse a JSON response against the shape the client actually destructures, and throw naming what
 * arrived when it does not match.
 *
 * ## Why this exists
 *
 * Twenty-one `fetch*` helpers in `src/lib/api.ts` used to declare a named return type and then hand
 * back `response.json()` unchecked. That cast is a compile-time claim about a runtime payload, so a
 * backend contract change was invisible to `tsc`, to every unit test, and to the reviewer.
 *
 * It was not hypothetical. In #114 `/api/indexers-enriched` moved to kittiwake and changed from
 * `{ indexers, computedAt }` to `{ data: [...] }` with every field renamed. The route answered `200`
 * with a hundred healthy rows, the build stayed green, and the Indexer Directory rendered `—` for
 * Score, APR, APY, Fees and eligibility on all 80 indexers for a day.
 *
 * `scripts/e2e/run.mjs` asserts the same shapes against the live deployment every fifteen minutes.
 * That is detection: it shortens the window, it cannot fail a pull request, and it cannot stop a bad
 * deploy shipping. This is the prevention half - the consumer refusing a payload it cannot read.
 *
 * ## Two rules, both bought with an outage
 *
 * 1. **Throw loudly on an unrecognised shape**, naming the keys actually received. A silent fallback
 *    to a degraded render is what turned #114 into a day rather than a page-load. Several helpers
 *    here previously ended `json.data ?? []`, which is exactly that fallback wearing a `??`.
 *
 * 2. **Presence is not fullness.** An address with no rewards legitimately answers
 *    `{"history": []}`, and a network with no supply reading legitimately omits `grtSupply`. The
 *    first run of the e2e contracts rejected empty results and produced four false alarms; a parser
 *    that did the same would break working pages. So `arrays` and `objects` accept empty ones, and
 *    anything genuinely optional in the declared type is simply not asserted.
 *
 * ## What this deliberately does not do
 *
 * It checks the envelope and the load-bearing keys, not every field. Exhaustive per-route schemas
 * would duplicate the types in `queries.ts` at twenty-one places and go stale, and they would reject
 * an additive backend change or a field the client never reads - breaking working pages to satisfy a
 * schema. The granularity here is the same one `scripts/e2e/contracts.mjs` settled on, so the two
 * lists read alike and can be compared by eye. Keep them in step when a route changes.
 */

export interface Contract {
  /** Dotted paths that must be defined. `null` counts as present: the backend sent it on purpose. */
  present?: string[];
  /** Dotted paths that must be arrays. May be empty - presence is not fullness. */
  arrays?: string[];
  /** Dotted paths that must be non-null objects. May have no keys. */
  objects?: string[];
  /**
   * Dotted path to a collection -> keys that must exist on its first element. Skipped when the
   * collection is empty, which is a legitimate answer rather than a broken contract.
   */
  rows?: Record<string, string[]>;
  /** Dotted path to return. Defaults to the whole body. */
  pick?: string;
}

const MISSING = Symbol('missing');

function resolve(body: unknown, path: string): unknown | typeof MISSING {
  let node: unknown = body;
  for (const segment of path.split('.')) {
    if (node === null || typeof node !== 'object') return MISSING;
    if (!(segment in (node as Record<string, unknown>))) return MISSING;
    node = (node as Record<string, unknown>)[segment];
  }
  return node;
}

/** What arrived, short enough to read in a console and specific enough to act on. */
function describe(value: unknown): string {
  if (value === MISSING) return 'nothing (the key is absent)';
  if (value === null) return 'null';
  if (Array.isArray(value)) return `an array of ${value.length}`;
  if (typeof value === 'object') {
    const keys = Object.keys(value as object);
    return keys.length ? `an object with keys: ${keys.slice(0, 12).join(', ')}` : 'an empty object';
  }
  return `${typeof value} (${JSON.stringify(value)?.slice(0, 40)})`;
}

function topLevel(body: unknown): string {
  if (body === null || typeof body !== 'object') return describe(body);
  return Array.isArray(body) ? `an array of ${body.length}` : Object.keys(body).join(', ') || '(none)';
}

function fail(route: string, detail: string, body: unknown): never {
  throw new Error(
    `${route}: ${detail}. Top-level keys: ${topLevel(body)}. ` +
      'The route changed contract; see src/lib/contract.ts and #124.',
  );
}

/**
 * Validate `body` against `contract` and return the picked value.
 *
 * The return type is still a cast - what this buys is that the cast is now guarded by the keys the
 * client reads, so the failure mode is a thrown error naming the payload rather than a page of
 * dashes.
 */
export function parseResponse<T>(route: string, body: unknown, contract: Contract = {}): T {
  if (body === null || typeof body !== 'object') {
    fail(route, `response was ${describe(body)}, not an object`, body);
  }

  for (const path of contract.objects ?? []) {
    const value = resolve(body, path);
    if (value === MISSING || value === null || typeof value !== 'object' || Array.isArray(value)) {
      fail(route, `expected an object at "${path}", got ${describe(value)}`, body);
    }
  }

  for (const path of contract.arrays ?? []) {
    const value = resolve(body, path);
    if (!Array.isArray(value)) {
      fail(route, `expected an array at "${path}", got ${describe(value)}`, body);
    }
  }

  for (const path of contract.present ?? []) {
    const value = resolve(body, path);
    if (value === MISSING || value === undefined) {
      fail(route, `expected a value at "${path}", got ${describe(value)}`, body);
    }
  }

  for (const [path, keys] of Object.entries(contract.rows ?? {})) {
    const value = resolve(body, path);
    if (!Array.isArray(value)) {
      fail(route, `expected an array at "${path}", got ${describe(value)}`, body);
    }
    // An empty collection is a legitimate answer, not a broken contract. Only a row that is present
    // and the wrong shape is a contract change.
    const first = value[0];
    if (first === undefined) continue;
    if (first === null || typeof first !== 'object') {
      fail(route, `expected objects in "${path}", got ${describe(first)}`, body);
    }
    const absent = keys.filter((k) => !(k in (first as Record<string, unknown>)));
    if (absent.length) {
      fail(
        route,
        `rows in "${path}" are missing ${absent.join(', ')} - the row has ${describe(first)}`,
        body,
      );
    }
  }

  if (contract.pick === undefined) return body as T;

  const picked = resolve(body, contract.pick);
  if (picked === MISSING) {
    fail(route, `expected a value at "${contract.pick}", got nothing (the key is absent)`, body);
  }
  return picked as T;
}
