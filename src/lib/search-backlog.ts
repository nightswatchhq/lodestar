/**
 * What to say when a subgraph search finds nothing.
 *
 * "No results" and "no results yet" are different answers, and until now the search box gave the
 * first when it meant the second. Names live in IPFS documents and IPFS has no index: you can fetch
 * a document only if you already know its hash, so the searchable set is exactly the set somebody
 * has already fetched. A subgraph published ten minutes ago is not findable by name until the warm
 * job has been round for it.
 *
 * `/api/subgraph-search` carries `warmBacklog` for precisely this. See kittiwake#8.
 */

/** How many documents are still unfetched, or `null` when no warm run has finished yet. */
export type WarmBacklog = number | null | undefined;

/**
 * Whether a query is answered from the name index at all.
 *
 * A deployment hash or a contract address is looked up in the chain's own data, where nothing is
 * waiting to be warmed. Offering the backlog caveat there would be a true statement about an
 * irrelevant thing, which is its own kind of wrong.
 */
export function isNameQuery(q: string): boolean {
  const t = q.trim();
  return !/^0x[0-9a-fA-F]{40}$/.test(t) && !/^Qm[1-9A-HJ-NP-Za-km-z]{2,44}$/.test(t);
}

/**
 * The empty-state sentence for a search that returned nothing.
 *
 * Three states, deliberately, because the middle one is the whole point:
 *
 *   backlog 0        nothing is waiting, so "no such subgraph" is a real answer
 *   backlog > 0      some documents are unfetched, so the answer is "not yet", with the number
 *   backlog unknown  no warm run has completed, so we cannot claim either
 */
export function emptySearchMessage(query: string, backlog: WarmBacklog): string {
  const q = query.trim();
  const found = q ? `No subgraphs found for “${q}”` : 'No subgraphs found';

  if (!isNameQuery(q)) return `${found}.`;

  if (backlog === null || backlog === undefined) {
    return `${found} yet. The name index is still being built, so a subgraph that exists may not be findable by name.`;
  }
  if (backlog > 0) {
    const n = backlog.toLocaleString();
    const docs = backlog === 1 ? 'document is' : 'documents are';
    return `${found} yet. ${n} subgraph ${docs} still being indexed, so a recently published one may not be findable by name.`;
  }
  return `${found}.`;
}
