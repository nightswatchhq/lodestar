/**
 * A shed request is the gate working. Ask once more before calling it a failure.
 *
 * kittiwake holds a fixed number of nest permits and sheds what it cannot serve, answering
 * `503 nest_busy` or `429`. That is deliberate: a heavy fold arriving while an ingest job holds
 * permits is refused rather than queued behind it, and the permits come back in seconds.
 *
 * `scripts/e2e/run.mjs` learned this on 2026-09-12, when `/api/apr-provenance/` shed one request,
 * paged the channel, and answered 200 on three retries immediately afterwards. **The app never
 * learned it.** So a single shed request still became a console error and a panel with no data,
 * for a backend that was working exactly as designed and would have answered a second later.
 *
 * It showed up in the page sweep as a hard signal that moved around: sixteen errors on
 * `/indexers/[address]` in one run and a single error on `/` in the next, which is the shape of a
 * transient rather than a broken page.
 *
 * **Twice in a row is still a failure.** Sustained shedding is a real capacity problem and hiding
 * it behind retries is how a capacity problem becomes an outage nobody saw coming - which is very
 * nearly what happened this afternoon.
 */

/** Long enough for a permit to come back, short enough that nobody watches a spinner for it. */
const SHED_PAUSE_MS = 2500;

/**
 * Was this refusal the gate shedding rather than the route failing?
 *
 * Reads the body for `nest_busy`, because a 503 also means a retired nest and a deployment with no
 * SQL tier, and retrying either of those is asking a question already answered.
 */
export function wasShed(status: number, body: string): boolean {
  if (status === 429) return true;
  return status === 503 && /nest_busy|nest busy/.test(body);
}

/**
 * Fetch, and ask a second time if the first was shed.
 *
 * The second answer stands either way: shed twice is returned as the 503 it is, so a genuine
 * capacity problem still looks like one to everything upstream.
 */
export async function fetchShedAware(url: string, init?: RequestInit): Promise<Response> {
  // `init` is forwarded only when there is one. `fetch(url, undefined)` behaves identically but is
  // a two-argument call, and a caller asserting on the arguments sees the difference.
  const call = () => (init === undefined ? fetch(url) : fetch(url, init));

  const first = await call();
  if (first.ok || (first.status !== 503 && first.status !== 429)) return first;

  // The body has to be read to tell a shed apart from a retired nest, and a Response body can only
  // be read once - so it is cloned, and the original is still returned intact when it is not a shed.
  const body = await first.clone().text().catch(() => '');
  if (!wasShed(first.status, body)) return first;

  await new Promise((r) => setTimeout(r, SHED_PAUSE_MS));
  return call();
}
