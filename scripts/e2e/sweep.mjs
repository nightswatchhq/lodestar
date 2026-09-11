// A diagnostic sweep of every page, looking for the failure the suite cannot see.
//
//   node scripts/e2e/sweep.mjs                      # production
//   LODESTAR_BASE=http://localhost:3000 node ...    # anywhere else
//
// `pages.spec.ts` covers ten of forty-two pages, and six of those only assert that no error
// boundary rendered and that the body has more than four hundred characters. #114 is the reason
// that is not enough: `/indexers` returned 200, rendered its full table, and every cell was a dash.
// A page can be up, quiet in the console, and carrying no information at all.
//
// So this reports what a page is actually showing rather than whether it threw: how much text, how
// many placeholder glyphs against how many real figures, and what the console said. It prints a
// table and exits 0 either way. It is a thing to read, not a gate - the gate is the spec file, and
// what this finds should end up there.

import { chromium } from '@playwright/test';

const BASE = process.env.LODESTAR_BASE ?? 'https://www.lodestar-dashboard.com';

/** Dynamic routes need a real subject; a 404 page is not evidence about the template. */
const SUBJECT = {
  address: '0x4e5c87772c29381bcabc58c3f182b6633b5a274a',
  deployment: 'Qmbsc6XQWbiv4DfLVfaNciScqYLyDWUYjWzrFBbzzmRsMB',
  slug: 'amp-paper-trail',
};

const PAGES = [
  '/', '/activity', '/ai', '/blog', `/blog/${SUBJECT.slug}`, '/calculator', '/compare',
  '/curate', '/curators', `/curators/${SUBJECT.address}`, '/data-services', '/delegate',
  '/delegators', `/delegators/${SUBJECT.address}`, '/disassembly',
  `/disassembly/${SUBJECT.deployment}`, '/dock/subgraphs', '/foghorn', '/grt-flow',
  '/indexers', `/indexers/${SUBJECT.address}`, `/indexers/${SUBJECT.address}/delegate`,
  '/indexing', '/migration', '/network', '/payments', `/payments/${SUBJECT.address}`,
  '/poi', `/poi/${SUBJECT.deployment}`, '/privacy', '/profile', '/qos', '/revert',
  '/scuttlebutt', '/sql', '/subgraphs', `/subgraphs/${SUBJECT.deployment}`, '/support',
  '/support/new', '/verify',
];

/** An em dash, an en dash, a lone hyphen in a cell, or an explicit "not available". */
const PLACEHOLDER = /(?:^|\s)(?:—|–|-{1,2}|N\/A|n\/a)(?=\s|$)/g;
/** A figure with a magnitude, a percentage, or a GRT amount: something was actually rendered. */
const FIGURE = /\d[\d,.]*\s*(?:%|GRT|M|B|K)\b|\$\s?\d[\d,.]*|\b\d{2,}\b/g;

const ERROR_BOUNDARY = /Application error|Something went wrong|Unhandled Runtime Error|500 -|404 -/i;

/**
 * Pages whose placeholders are the correct answer, so the dash heuristic is noise on them.
 *
 * Listed rather than silently skipped: each one still gets its status, console errors and content
 * length checked, and a page that stops belonging here should be removed rather than left to make
 * the sweep quieter than the site.
 */
const DASHES_ARE_CORRECT = {
  '/compare': 'a comparison with nothing selected yet; every cell is "--" until two indexers are picked',
};

function count(text, re) {
  return (text.match(re) ?? []).length;
}

const browser = await chromium.launch();
const rows = [];

for (const path of PAGES) {
  const page = await browser.newPage({ userAgent: 'lodestar-sweep/1.0 (+qa)' });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message.slice(0, 120)));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const t = m.text();
    // 429s are this sweep throttling itself, not the page failing. Same reasoning as the spec.
    if (/status of 429/.test(t)) return;
    errors.push(t.slice(0, 120));
  });

  let status = 0;
  let text = '';
  try {
    const res = await page.goto(BASE + path, { waitUntil: 'networkidle', timeout: 45_000 });
    status = res?.status() ?? 0;
    // Client-rendered: the shell arrives first and the figures follow, so read after the network
    // settles and then give the last render a moment.
    await page.waitForTimeout(1500);
    text = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
  } catch (e) {
    errors.push(`navigation: ${String(e).slice(0, 120)}`);
  }

  const main = text.slice(0, 20_000);
  rows.push({
    path,
    status,
    chars: text.length,
    figures: count(main, FIGURE),
    dashes: count(main, PLACEHOLDER),
    boundary: ERROR_BOUNDARY.test(text),
    errors,
  });
  await page.close();
}

await browser.close();

const pad = (s, n) => String(s).padEnd(n);
console.log(`\n${pad('page', 56)} ${pad('http', 5)} ${pad('chars', 7)} ${pad('figs', 5)} ${pad('dash', 5)} notes`);
console.log('-'.repeat(110));

let suspicious = 0;
for (const r of rows) {
  const notes = [];
  if (r.status >= 400 || r.status === 0) notes.push(`HTTP ${r.status}`);
  if (r.boundary) notes.push('ERROR BOUNDARY');
  if (r.chars < 400) notes.push('almost no content');
  // The #114 shape: plenty of layout, nothing in it. Only meaningful where a page is data-led, so
  // it is reported rather than judged, and pages with no figures by design will show up here too.
  const dashesExpected = r.path in DASHES_ARE_CORRECT;
  if (r.figures === 0 && r.chars > 400 && !dashesExpected) notes.push('NO FIGURES');
  else if (r.dashes > r.figures && r.figures > 0 && !dashesExpected) {
    notes.push('more placeholders than figures');
  }
  if (r.errors.length) notes.push(`${r.errors.length} console error(s)`);
  if (notes.length) suspicious++;
  console.log(
    `${pad(r.path, 56)} ${pad(r.status, 5)} ${pad(r.chars, 7)} ${pad(r.figures, 5)} ${pad(r.dashes, 5)} ${notes.join('; ')}`,
  );
}

console.log('-'.repeat(110));
console.log(`${rows.length} pages, ${suspicious} worth looking at\n`);

for (const r of rows.filter((x) => x.errors.length)) {
  console.log(`${r.path}`);
  for (const e of r.errors.slice(0, 4)) console.log(`    ${e}`);
}
