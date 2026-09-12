#!/usr/bin/env node
/**
 * End-to-end check of the live Lodestar surface: API shapes, page renders, and the health verdict.
 *
 * Written after #114, where `/api/indexers-enriched` answered `200` with a hundred perfectly good
 * rows while every score, APR and eligibility column on `/indexers` rendered as a dash. A status
 * sweep saw nothing wrong, because nothing *was* wrong with the status. The contract had moved under
 * a client that destructures the payload, and a `response.json()` cast hid it from the compiler.
 *
 *   node scripts/e2e/run.mjs [--base https://…] [--alert]
 *
 * Exits non-zero on any failure, so CI and cron both gate on it. `--alert` additionally posts a
 * summary to `DISCORD_WEBHOOK_URL`. The webhook is read from the environment and never printed:
 * this repository is public.
 */
import { CONTRACTS, LIVENESS, PAGES, HEALTH } from './contracts.mjs';

const BASE = argOf('--base') ?? process.env.LODESTAR_BASE ?? 'https://www.lodestar-dashboard.com';
const ALERT = process.argv.includes('--alert');
const TIMEOUT_MS = Number(process.env.E2E_TIMEOUT_MS ?? 60000);
const UA = { 'User-Agent': 'lodestar-e2e/1.0 (+monitoring)' };

function argOf(flag) {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const failures = [];
const passes = [];
function fail(area, name, detail) { failures.push({ area, name, detail }); }
function pass(name) { passes.push(name); }

async function once(path) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  const started = Date.now();
  try {
    const res = await fetch(BASE + path, { headers: UA, signal: ctl.signal });
    const text = await res.text();
    return { status: res.status, text, ms: Date.now() - started };
  } finally {
    clearTimeout(t);
  }
}

/**
 * A refusal under load is the gate working, not the site being broken.
 *
 * kittiwake holds a fixed number of nest permits and sheds what it cannot serve, answering 503
 * `nest_busy` or 429. That is the design: a heavy fold arriving while an ingest job holds permits
 * is turned away rather than queued until everything is slow. Reporting one of those as an outage
 * posts "Lodestar e2e: 1 failing" to a channel for a service that is behaving exactly as intended,
 * and an alert that cries wolf is the one people learn to scroll past.
 *
 * It happened on 2026-09-12: `/api/apr-provenance/` shed one request, alerted, and answered 200 on
 * each of three retries seconds later.
 *
 * So a shed request is retried once, after a pause long enough for the permits to come back.
 * **Twice in a row is still a failure**, because sustained shedding is a real capacity problem and
 * this must not be able to hide one. The same reasoning the browser suite already applies to 429s.
 */
const SHED_PAUSE_MS = 2500;

function wasShed({ status, text }) {
  if (status === 429) return true;
  return status === 503 && /nest_busy|nest busy/.test(text);
}

async function get(path) {
  const first = await once(path);
  if (!wasShed(first)) return first;
  await new Promise((r) => setTimeout(r, SHED_PAUSE_MS));
  const second = await once(path);
  // The second answer either way: if it was shed again the caller sees the 503 and fails, which
  // is what a genuine capacity problem should look like.
  return second;
}

/** Walk a dotted path. Returns `undefined` for any missing link rather than throwing. */
function dig(obj, dotted) {
  return dotted.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

function isEmpty(v) {
  return v === undefined || v === null || v === '' ||
    (Array.isArray(v) && v.length === 0) ||
    (typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 0);
}

async function checkContract(c) {
  let r;
  try {
    r = await get(c.path);
  } catch (e) {
    return fail('contract', c.name, `${c.path} did not answer: ${e.name === 'AbortError' ? `timeout after ${TIMEOUT_MS}ms` : e.message}`);
  }
  if (r.status !== 200) {
    let why = r.text.slice(0, 120).replace(/\s+/g, ' ');
    return fail('contract', c.name, `${c.path} HTTP ${r.status} ${why}`);
  }
  let body;
  try {
    body = JSON.parse(r.text);
  } catch {
    return fail('contract', c.name, `${c.path} returned non-JSON`);
  }

  // **Presence, not fullness.** These assert the *shape*, and an empty result is a legitimate state
  // for most of them: an address with no rewards answers `{"history": []}`, a period with no votes
  // answers `{"tallies": []}`, an indexer who is not a delegator answers `{"delegator": null}`.
  // Treating those as missing produced four false alarms on the first run, which is precisely the
  // way a monitor loses the right to be believed. Where emptiness *is* the fault - a directory with
  // no indexers - use `collection`/`minRows`/`coverage`, which check the rows themselves.
  for (const req of c.required ?? []) {
    if (dig(body, req) === undefined) {
      return fail('contract', c.name,
        `${c.path} has no "${req}" - the frontend reads this by name. ` +
        `Top-level keys: ${Object.keys(body).join(', ')}`);
    }
  }

  // A route the client normalises may legitimately answer in more than one shape; assert that it is
  // one the normaliser knows, and that the rows carry the fields under whichever names go with it.
  if (c.eitherOf) {
    const key = c.eitherOf.find((k) => Array.isArray(body[k]));
    if (!key) {
      return fail('contract', c.name,
        `${c.path}: none of ${c.eitherOf.map((k) => `"${k}"`).join(' or ')} is an array. ` +
        `Top-level keys: ${Object.keys(body).join(', ')}. This is the #114 shape change.`);
    }
    const rows = body[key];
    if (rows.length < (c.minRows ?? 1)) {
      return fail('contract', c.name, `${c.path}: ${rows.length} row(s), expected at least ${c.minRows ?? 1}`);
    }
    const alt = c.eitherOf.indexOf(key); // 0 = legacy names, 1 = kittiwake names
    const first = rows[0];
    const missing = (c.sample ?? []).map((pair) => pair[alt]).filter((f) => !(f in first));
    if (missing.length) {
      return fail('contract', c.name,
        `${c.path}: rows under "${key}" are missing ${missing.map((m) => `"${m}"`).join(', ')}. ` +
        `Row keys: ${Object.keys(first).slice(0, 14).join(', ')}`);
    }
    for (const cov of c.coverage ?? []) {
      const f = cov.field[alt];
      const present = rows.filter((x) => !isEmpty(x[f])).length;
      const pct = Math.round((present / rows.length) * 100);
      if (pct < cov.minPresentPct) {
        return fail('contract', c.name,
          `${c.path}: "${f}" present on only ${pct}% of ${rows.length} rows (want >= ${cov.minPresentPct}%) ` +
          '- the column renders empty at this rate');
      }
    }
    return pass(`contract ${c.name}`);
  }

  if (c.collection) {
    const rows = dig(body, c.collection);
    if (!Array.isArray(rows)) {
      return fail('contract', c.name,
        `${c.path}: "${c.collection}" is not an array (got ${rows === undefined ? 'nothing' : typeof rows}). ` +
        `Top-level keys: ${Object.keys(body).join(', ')}. This is the #114 shape change.`);
    }
    if (rows.length < (c.minRows ?? 1)) {
      return fail('contract', c.name, `${c.path}: ${rows.length} row(s), expected at least ${c.minRows ?? 1}`);
    }
    const first = rows[0];
    const missing = (c.sample ?? []).filter((f) => !(f in first));
    if (missing.length) {
      return fail('contract', c.name,
        `${c.path}: rows are missing ${missing.map((m) => `"${m}"`).join(', ')}. ` +
        `Row keys: ${Object.keys(first).slice(0, 14).join(', ')}`);
    }
    for (const cov of c.coverage ?? []) {
      const present = rows.filter((x) => !isEmpty(x[cov.field])).length;
      const pct = Math.round((present / rows.length) * 100);
      if (pct < cov.minPresentPct) {
        return fail('contract', c.name,
          `${c.path}: "${cov.field}" present on only ${pct}% of ${rows.length} rows ` +
          `(want >= ${cov.minPresentPct}%) - the column renders empty at this rate`);
      }
    }
  }
  pass(`contract ${c.name}`);
}

async function checkLiveness(path) {
  try {
    const r = await get(path);
    // 4xx here is a real answer from a live handler; 5xx and no-answer are not.
    if (r.status >= 500) return fail('liveness', path, `HTTP ${r.status}`);
    pass(`liveness ${path}`);
  } catch (e) {
    fail('liveness', path, e.name === 'AbortError' ? `timeout after ${TIMEOUT_MS}ms` : e.message);
  }
}

async function checkPage(p) {
  try {
    const r = await get(p.path);
    if (r.status !== 200) return fail('page', p.name, `${p.path} HTTP ${r.status}`);
    // The app is client-rendered, so the shell is all that arrives here. That still catches a build
    // break, a 500, or a routing regression; the *content* of a rendered page is Playwright's job
    // (scripts/e2e/pages.spec.ts) and is not duplicated badly here.
    if (!/<html/i.test(r.text)) return fail('page', p.name, `${p.path} did not return an HTML document`);
    for (const s of p.mustContain ?? []) {
      if (!r.text.includes(s)) {
        return fail('page', p.name, `${p.path} shell is missing "${s}"`);
      }
    }
    pass(`page ${p.path}`);
  } catch (e) {
    fail('page', p.name, e.name === 'AbortError' ? `timeout after ${TIMEOUT_MS}ms` : e.message);
  }
}

async function checkHealth() {
  try {
    const r = await get(HEALTH.path);
    const body = JSON.parse(r.text);
    if (body.status !== HEALTH.mustBe) {
      const bad = Object.entries(body.ingestion ?? {})
        .filter(([, v]) => v && v.healthy === false)
        .map(([k, v]) => `${k} (${v.age_minutes}m)`);
      return fail('health', 'self-reported health', 
        `status="${body.status}", expected "${HEALTH.mustBe}"` + (bad.length ? `; stale: ${bad.join(', ')}` : ''));
    }
    for (const [name, c] of Object.entries(body.components ?? {})) {
      if (c.status !== 'up') fail('health', name, `component is "${c.status}"`);
    }
    pass('health verdict');
  } catch (e) {
    fail('health', 'self-reported health', e.message);
  }
}

async function alertDiscord(summary) {
  const url = process.env.DISCORD_WEBHOOK_URL;
  if (!url) {
    console.error('\n--alert was passed but DISCORD_WEBHOOK_URL is not set; not alerting.');
    // Deliberately non-fatal on its own: a missing webhook must not turn a healthy run red, and it
    // must not turn a failing run green either - the exit code below is decided by `failures`.
    return;
  }
  const lines = failures.slice(0, 12).map((f) => `• **${f.area}** ${f.name}\n  ${f.detail}`);
  const more = failures.length > 12 ? `\n…and ${failures.length - 12} more.` : '';
  const content =
    `🔴 **Lodestar e2e: ${failures.length} failing** (${passes.length} passing) — ${BASE}\n\n` +
    lines.join('\n') + more;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    // Discord caps content at 2000 characters and rejects the whole message over it.
    body: JSON.stringify({ content: content.slice(0, 1900), username: 'lodestar-e2e' }),
  });
  if (!res.ok) {
    // Loud: an alerting path that fails quietly is how an outage goes unreported, which is the whole
    // reason this script exists.
    console.error(`ALERT DELIVERY FAILED: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
    process.exitCode = 2;
  } else {
    console.error('alert posted to Discord.');
  }
}

/**
 * Fill `{address}`, `{hash}` and `{poiDeployment}` from live data.
 *
 * Hardcoding an indexer would red this monitor the day that indexer left the network - a false alarm
 * about the wrong thing, which is the failure mode these checks exist to avoid.
 */
async function harvest() {
  const out = {};
  try {
    const r = await get('/api/indexers?first=1');
    const rows = JSON.parse(r.text)?.data?.indexers ?? [];
    if (rows[0]?.id) out.address = rows[0].id;
  } catch { /* left undefined; the substitution below reports it */ }
  try {
    const r = await get('/api/subgraph-deployments');
    const m = r.text.match(/"(Qm[1-9A-HJ-NP-Za-km-z]{44})"/);
    if (m) out.hash = m[1];
  } catch { /* as above */ }
  try {
    // From the POI overview's own first row, not from `{hash}`: an arbitrary subgraph need not have
    // any closed allocations carrying a POI, and a legitimate 404 would red this for the wrong
    // reason.
    const r = await get('/api/poi');
    const rows = JSON.parse(r.text)?.data?.deployments ?? [];
    if (rows[0]?.deploymentId) out.poiDeployment = rows[0].deploymentId;
  } catch { /* as above */ }
  return out;
}

const t0 = Date.now();
console.log(`lodestar e2e against ${BASE}\n`);
const params = await harvest();
await checkHealth();
for (const c of CONTRACTS) {
  if (/\{\w+\}/.test(c.path)) {
    const need = c.path.match(/\{\w+\}/g).map((x) => x.slice(1, -1));
    const missing = need.filter((k) => !params[k]);
    if (missing.length) {
      // Not silently skipped: a check that quietly does not run is indistinguishable from one that
      // passed, which is the whole lesson of #114.
      fail('contract', c.name, `could not harvest ${missing.join(', ')} to build ${c.path}`);
      continue;
    }
    await checkContract({ ...c, path: c.path.replace(/\{(\w+)\}/g, (_, k) => params[k]) });
  } else {
    await checkContract(c);
  }
}
for (const p of LIVENESS) await checkLiveness(p);
for (const p of PAGES) await checkPage(p);

for (const f of failures) console.log(`FAIL  [${f.area}] ${f.name}\n      ${f.detail}`);
console.log(`\n${passes.length} passed, ${failures.length} failed in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

if (ALERT && failures.length) await alertDiscord();
process.exit(failures.length ? 1 : (process.exitCode ?? 0));
