/**
 * What the four SQL routes answer.
 *
 * Lifted out of the page, where each shape sat beside an `as` cast on `res.json()`. All four calls
 * checked their status, so none of them was in the last sweep; none of them checked what came back,
 * which is the failure #114 actually was.
 */

export interface CatalogColumn {
  name: string;
  type: string;
  indexed: boolean;
}

export interface CatalogTable {
  name: string;
  alias: string;
  event: string;
  columns: CatalogColumn[];
}

export interface CatalogDataset {
  id: string;
  label: string;
  chain: string;
  description: string;
  sample: string;
  available: boolean;
  archival?: boolean;
  tableCount: number;
  tables: CatalogTable[];
  error?: string;
}

export interface SqlCatalog {
  /** `false` when this deployment has no SQL tier. A real answer, and the route says it with 503. */
  available: boolean;
  datasets: CatalogDataset[];
}

export interface QueryResult {
  dataset: string;
  count: number;
  rows: Record<string, unknown>[];
  truncated: boolean;
  degraded: boolean;
  degradedTables: string[];
  tipUnavailable: boolean;
  provenance: {
    as_of?: number | null;
    sealed_through?: number | null;
    source?: string;
    registry_hash?: string | null;
    nid?: string | null;
  } | null;
}

export interface NamedQueryParam {
  name: string;
  type: string;
  description: string;
}

export interface NamedQueryDef {
  name: string;
  dataset: string;
  description: string;
  params: NamedQueryParam[];
  sql: string;
}

export interface NamedResult {
  query: string;
  sql: string;
  count: number;
  rows: Record<string, unknown>[];
  provenance: { as_of?: number | null } | null;
}

/**
 * A signed answer, as `tattler::Receipt` defines it.
 *
 * `rows` travels with the body because a verifier re-hashes them rather than trusting
 * `body.result_hash`, and `pubkey` because a receipt names the public half of the key that signed
 * it - the verifier checks against the key the receipt carries, not one it has memorised, which is
 * what let the issuer key be rotated on 12 September without invalidating anything.
 */
export interface Receipt {
  body: {
    nid: string | null;
    dataset: string;
    query: string;
    as_of_block: number;
    sealed_through: number | null;
    registry_hash: string | null;
    result_hash: string;
    row_count: number;
    issued_at: string;
    query_name?: string | null;
    query_args?: Record<string, unknown>;
  };
  rows: Record<string, unknown>[];
  pubkey: string;
  signature: string;
}
