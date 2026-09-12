/**
 * The backend migration, as it actually stands.
 *
 * A server component reading the same inventory the edge routes from, so the figure on this page
 * and the routing decision in `src/proxy.ts` cannot disagree: there is one list, and
 * `migration.test.ts` holds it against the filesystem.
 *
 * The numbers are deliberately unflattering. Crons and the six routes already agreed for deletion
 * are kept out of the denominator and reported separately, because folding either into the
 * percentage would make it a claim about something other than the work remaining.
 */
import type { Metadata } from 'next';
import { buildInventory, summarise, type RouteRecord, type Workstream } from '@/lib/migration';
import { ROUTE_FILES } from '@/lib/route-files.generated';
import { Card } from '@/components/ui/Card';

export const metadata: Metadata = {
  title: 'Backend migration | Lodestar',
  description:
    'How much of the Lodestar API is served by kittiwake, the Rust backend, and how much is still Next.',
};

const ISSUE = 'https://github.com/nightswatchhq/kittiwake/issues';

/** What each block of work is waiting on, and the issue that tracks it. */
const WORKSTREAM_NOTES: Partial<Record<Workstream, { issue: number; what: string }>> = {
  'the Dock': { issue: 16, what: 'Sessions are done and pinned against tokens the old service minted. Deploy-key storage, IPFS upload and the bounty lifecycle are not.' },
  'the disassembler': { issue: 18, what: 'Onto wasmtime with fuel and epoch limits, so a module that loops forever is stopped by the runtime rather than by a timeout wrapped around it.' },
  'the SQL upper tier': { issue: 19, what: 'Named queries and signed receipts. The receipt has to bind the block the nest had sealed through, or it is only checkable by someone who already trusts us.' },
  'the long tail': { issue: 20, what: 'Twenty-five routes with no common shape. To be triaged rather than worked through: porting a route nobody reads is worse than deleting it.' },
};

function Bar({ done, total }: { done: number; total: number }) {
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  return (
    <div
      className="h-1.5 w-full rounded-full bg-[var(--bg-elevated)] overflow-hidden"
      role="img"
      aria-label={`${done} of ${total} routes on kittiwake, ${pct} percent`}
    >
      <div className="h-full rounded-full bg-[var(--accent)]" style={{ width: `${pct}%` }} />
    </div>
  );
}

function Stat({ value, label, hint }: { value: string; label: string; hint?: string }) {
  return (
    <div>
      <p className="font-mono text-2xl font-semibold text-[var(--text)]">{value}</p>
      <p className="text-[11px] uppercase tracking-wide text-[var(--text-muted)] mt-0.5">{label}</p>
      {hint && <p className="text-[11px] text-[var(--text-faint)] mt-1 leading-relaxed">{hint}</p>}
    </div>
  );
}

function RouteList({ routes }: { routes: RouteRecord[] }) {
  return (
    <ul className="mt-3 grid gap-x-6 gap-y-1 sm:grid-cols-2">
      {routes.map((r) => (
        <li key={r.path} className="font-mono text-[11px] text-[var(--text-muted)] truncate" title={r.note ?? r.path}>
          {r.path}
        </li>
      ))}
    </ul>
  );
}

export default function MigrationPage() {
  const inventory = buildInventory(ROUTE_FILES);
  const s = summarise(inventory);
  const staying = inventory.filter((r) => r.state === 'staying');
  const doomed = inventory.filter((r) => r.state === 'doomed');

  return (
    <main className="mx-auto max-w-4xl px-4 py-10">
      <header className="mb-8">
        <p className="text-[11px] font-mono uppercase tracking-wide text-[var(--text-faint)]">
          Backend migration
        </p>
        <h1 className="text-2xl font-semibold text-[var(--text)] mt-1">
          Lodestar API: Next to kittiwake
        </h1>
        <p className="text-sm text-[var(--text-muted)] mt-3 leading-relaxed max-w-2xl">
          Lodestar&apos;s API is moving from Next.js route handlers to{' '}
          <span className="font-mono">kittiwake</span>, a single Rust process that fronts the
          nuthatch nests with an admission gate, request coalescing and a derived freshness model.
          The two run side by side on one domain: the edge forwards the routes kittiwake serves and
          leaves the rest where they are, so there is no flag day and no window where neither
          answers.
        </p>
      </header>

      <Card>
        <div className="flex items-baseline justify-between gap-4 mb-4">
          <h2 className="text-sm font-medium text-[var(--text)]">Public read surface</h2>
          <p className="font-mono text-3xl font-semibold text-[var(--accent)]">{s.percent}%</p>
        </div>
        <Bar done={s.onKittiwake} total={s.inScope} />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 mt-6">
          <Stat value={String(s.onKittiwake)} label="on kittiwake" />
          <Stat value={String(s.onNext)} label="still on Next" />
          <Stat value={String(s.inScope)} label="in scope" />
          <Stat
            value={String(s.doomed + s.stayingOnNext)}
            label="excluded"
            hint={`${s.doomed} agreed for deletion, ${s.stayingOnNext} staying on Next by decision`}
          />
        </div>
        <p className="text-[11px] text-[var(--text-faint)] mt-6 leading-relaxed">
          The denominator counts routes that are meant to move and have not yet. It excludes the{' '}
          {s.doomed} routes already agreed for deletion, the {s.stayingOnNext} staying here on
          purpose, and {s.scheduled} scheduled endpoints, each of which is listed below rather than
          quietly improving the figure.
        </p>
      </Card>

      <section className="mt-8">
        <h2 className="text-sm font-medium text-[var(--text)] mb-3">What is left, by block of work</h2>
        <div className="space-y-3">
          {s.byWorkstream.map((w) => {
            const note = WORKSTREAM_NOTES[w.workstream];
            const routes = inventory.filter((r) => r.workstream === w.workstream && r.state === 'next');
            return (
              <Card key={w.workstream}>
                <div className="flex items-baseline justify-between gap-4">
                  <h3 className="text-sm font-medium text-[var(--text)]">{w.workstream}</h3>
                  <p className="font-mono text-[11px] text-[var(--text-muted)] shrink-0">
                    {w.onKittiwake}/{w.total} done
                  </p>
                </div>
                <div className="mt-2">
                  <Bar done={w.onKittiwake} total={w.total} />
                </div>
                {note && (
                  <p className="text-[11px] text-[var(--text-muted)] mt-3 leading-relaxed">
                    {note.what}{' '}
                    <a
                      href={`${ISSUE}/${note.issue}`}
                      className="text-[var(--accent)] hover:underline font-mono"
                      target="_blank"
                      rel="noreferrer"
                    >
                      kittiwake#{note.issue}
                    </a>
                  </p>
                )}
                {routes.length > 0 && <RouteList routes={routes} />}
              </Card>
            );
          })}
        </div>
      </section>

      <section className="mt-8 grid gap-3 sm:grid-cols-2">
        <Card>
          <h3 className="text-sm font-medium text-[var(--text)]">Staying on Next</h3>
          <p className="text-[11px] text-[var(--text-muted)] mt-1">
            Not backlog. Each of these has a reason it is here.
          </p>
          <ul className="mt-3 space-y-3">
            {staying.map((r) => (
              <li key={r.path}>
                <p className="font-mono text-[11px] text-[var(--text)]">{r.path}</p>
                <p className="text-[11px] text-[var(--text-faint)] mt-0.5 leading-relaxed">{r.note}</p>
              </li>
            ))}
          </ul>
        </Card>
        <Card>
          <h3 className="text-sm font-medium text-[var(--text)]">To be deleted, not ported</h3>
          <p className="text-[11px] text-[var(--text-muted)] mt-1">
            Carrying a dead route across a migration is worse than dropping it.
          </p>
          <ul className="mt-3 space-y-3">
            {doomed.map((r) => (
              <li key={r.path}>
                <p className="font-mono text-[11px] text-[var(--text)]">{r.path}</p>
                <p className="text-[11px] text-[var(--text-faint)] mt-0.5 leading-relaxed">{r.note}</p>
              </li>
            ))}
          </ul>
        </Card>
      </section>

      <p className="text-[11px] text-[var(--text-faint)] mt-8 leading-relaxed">
        Computed from <span className="font-mono">src/lib/migration.ts</span>, the same list the
        edge routes from. A test walks{' '}
        <span className="font-mono">src/app/api</span> and fails if the two disagree, so a route
        added without a line in that table breaks the build rather than becoming an uncounted
        straggler. This page computes the figures from that module directly: there is no endpoint
        behind it, and there is no longer an API in this repository for one to live in.
      </p>
    </main>
  );
}
