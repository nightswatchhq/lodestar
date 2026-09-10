/**
 * The wire types for the Dock's routes.
 *
 * Copied from `lib/studio/db.ts` rather than imported, and the duplication is the point. Those are
 * the shapes Postgres returns to the Next handlers; these are the shapes a browser receives. They
 * are identical today because the handler passes rows through, and they stop being identical the
 * moment the routes move to kittiwake, which serialises from Rust.
 *
 * When kittiwake publishes a schema for these routes this file becomes generated and the
 * hand-written copy goes. Giving it its own file is what makes that a deletion rather than an
 * excavation: it has one job, and the job changes owner once.
 */

/** One subgraph in somebody's Dock. `snake_case` because that is what the wire carries. */
export interface StudioSubgraph {
  id: number;
  owner_address: string;
  slug: string;
  display_name: string | null;
  description: string | null;
  deployment_id: string | null;
  network: string | null;
  published_subgraph_id: string | null;
  version_label: string | null;
  last_published_deployment_id: string | null;
  created_at: string;
  updated_at: string;
}

/** A bounty offered for syncing a deployment. */
export interface SyncBounty {
  id: number;
  deployment_id: string;
  subgraph_id: number | null;
  developer_address: string;
  amount_grt: string;
  message: string | null;
  status: 'open' | 'claimed' | 'cancelled' | 'expired';
  claimed_by: string | null;
  claimed_at: string | null;
  created_at: string;
  expires_at: string | null;
  chain_bounty_id: string | null;
  post_tx_hash: string | null;
}

/**
 * What `/api/studio/deploy-key` reports.
 *
 * `key` is present exactly once, in the response to a rotation, and is never retrievable
 * afterwards: the server keeps only a hash. A UI that loses it has lost it.
 */
export interface DeployKeyInfo {
  hasKey: boolean;
  key?: string;
  createdAt?: string | null;
  lastUsedAt?: string | null;
}

/** Who the Dock thinks you are. `null` means signed out, not "not loaded yet". */
export interface StudioSession {
  address: string | null;
}

/** What the metadata upload returns, for the publish transaction to carry on chain. */
export interface UploadedMetadata {
  subgraphMetaBytes32: string;
  versionMetaBytes32: string;
}
