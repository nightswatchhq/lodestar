/**
 * The row shapes the Dock's panels render, with no query beside them.
 *
 * They used to sit in `studio/db.ts`, which opens a Postgres connection, so a client component
 * importing one type made this project's module graph reach for `DATABASE_URL`. The Dock's reads
 * and writes are kittiwake's now (kittiwake#16); this is what the frontend renders the answers
 * with.
 */

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
