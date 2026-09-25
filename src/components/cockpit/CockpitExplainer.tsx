import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';

const code = 'block overflow-x-auto rounded bg-[var(--bg-elevated)] px-3 py-2 font-mono text-xs text-[var(--text)] whitespace-pre';

/** What the hosted site shows instead of a Cockpit. Static: it contacts no agent and no Cockpit. */
export function CockpitExplainer() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-[var(--text)]">Cockpit</h1>
        <p className="text-sm text-[var(--text-muted)] mt-1 max-w-3xl">
          The Cockpit queues, approves and cancels allocation actions on your own indexer agent, the
          same queue <code className="font-mono">graph indexer actions</code> drives. It only runs
          self-hosted. This site never talks to an indexer agent, and no indexer should point a hosted
          dashboard at one.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>How it works</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="list-disc pl-5 space-y-1.5 text-sm text-[var(--text-muted)] max-w-3xl">
            <li>
              <code className="font-mono">lodestar-cockpit</code> runs inside your network beside the agent. It
              holds the agent&apos;s address and any token, and the browser never sees either.
            </li>
            <li>
              You sign in by signing a message with the indexer wallet or an operator wallet. The Cockpit
              checks the signer on chain with HorizonStaking&apos;s operator authorisation for the
              SubgraphService, then issues a one-hour session.
            </li>
            <li>
              It forwards these operations and nothing else: list actions, queue allocate, unallocate or
              reallocate, approve, cancel, and read indexing rules.
            </li>
            <li>
              A close is refused when your latest closed POI on that deployment disagreed with
              stake-weighted consensus.
            </li>
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Self-hosting it</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-[var(--text-muted)] max-w-3xl">
          <p>Build and run the Cockpit from the kittiwake repository, with a config beside it:</p>
          <code className={code}>{`cargo build --release --bin lodestar-cockpit
COCKPIT_CONFIG=cockpit.toml ./target/release/lodestar-cockpit`}</code>
          <code className={code}>{`indexer = "0xYourIndexer"
allowed_origin = "http://localhost:3000"
arbitrum_rpc = "https://arb1.arbitrum.io/rpc"

[agent]
url = "http://indexer-agent:18000/"`}</code>
          <p>Then build Lodestar pointed at it, and open /cockpit on that build:</p>
          <code className={code}>{`NEXT_PUBLIC_COCKPIT_URL=http://localhost:8088 pnpm build && pnpm start`}</code>
          <p>
            Serve both on the same site, such as two ports on localhost or two subdomains of one domain.
            The session cookie is SameSite=Strict and is not sent across sites.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
