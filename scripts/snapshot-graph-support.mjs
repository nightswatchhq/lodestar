// Regenerates src/data/graph-support.json from the live repository.
//
// The /support page prefers live data and falls back to this file, so the archive still renders
// when GitHub is unreachable or the token has expired. That fallback is only as good as the last
// run of this script, and the page states the snapshot date rather than passing it off as live.
//
//     pnpm support:snapshot
//
// Uses GITHUB_TOKEN when one is set and works without it: unauthenticated GitHub allows sixty
// requests an hour and this spends one.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

const REPO = 'nightswatchhq/graph-support';
const token = process.env.GITHUB_TOKEN;

const headers = {
  Accept: 'application/vnd.github.v3+json',
  ...(token ? { Authorization: `Bearer ${token}` } : {}),
};

const issues = [];
for (let page = 1; page <= 10; page++) {
  const res = await fetch(
    `https://api.github.com/repos/${REPO}/issues?state=all&sort=updated&direction=desc&per_page=100&page=${page}`,
    { headers },
  );
  if (!res.ok) {
    console.error(`GitHub answered ${res.status}${token ? ' (GITHUB_TOKEN may be expired)' : ''}`);
    process.exit(1);
  }
  const batch = await res.json();
  for (const issue of batch) {
    // The issues endpoint returns pull requests too, and they are not support threads.
    if (issue.pull_request) continue;
    issues.push({
      number: issue.number,
      title: issue.title,
      url: issue.html_url,
      state: issue.state === 'closed' ? 'closed' : 'open',
      labels: (issue.labels ?? []).map((l) => l.name ?? '').filter(Boolean),
      comments: issue.comments ?? 0,
      createdAt: issue.created_at,
      updatedAt: issue.updated_at,
    });
  }
  if (batch.length < 100) break;
}

if (issues.length === 0) {
  console.error('GitHub returned no issues; refusing to write an empty snapshot');
  process.exit(1);
}

issues.sort((a, b) => b.number - a.number);

writeFileSync(
  join(process.cwd(), 'src', 'data', 'graph-support.json'),
  `${JSON.stringify({ capturedAt: new Date().toISOString(), issues }, null, 2)}\n`,
);
console.log(`${issues.length} issues written`);
