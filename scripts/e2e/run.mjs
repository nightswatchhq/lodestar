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

async function get(path) {
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

  for (const req of c.required ?? []) {
    if (isEmpty(dig(body, req))) {
      return fail('contract', c.name, `${c.path} is missing "${req}" - the frontend reads this by name`);
    }
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

const t0 = Date.now();
console.log(`lodestar e2e against ${BASE}\n`);
await checkHealth();
for (const c of CONTRACTS) await checkContract(c);
for (const p of LIVENESS) await checkLiveness(p);
for (const p of PAGES) await checkPage(p);

for (const f of failures) console.log(`FAIL  [${f.area}] ${f.name}\n      ${f.detail}`);
console.log(`\n${passes.length} passed, ${failures.length} failed in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

if (ALERT && failures.length) await alertDiscord();
process.exit(failures.length ? 1 : (process.exitCode ?? 0));
