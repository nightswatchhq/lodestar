/**
 * What `/api/subgraph-search` answers.
 *
 * Three components wrote this shape out again independently - the disassembly picker, `/subgraphs`
 * and `/indexing` - and each parsed the envelope its own way. They agreed, as it happens, but three
 * copies of a shape is three chances to stop agreeing.
 */

export interface SubgraphSearchResult {
  id: string;
  metadata: { displayName: string; description: string | null } | null;
  currentVersion: {
    subgraphDeployment: {
      ipfsHash: string;
      signalledTokens: string;
      stakedTokens: string;
    };
  } | null;
}

export interface SubgraphSearchAnswer {
  hits: SubgraphSearchResult[];
  /**
   * How many documents the name index has yet to warm, or null when the route did not say.
   *
   * It rides along with the hits rather than sitting in its own state, so the message and the list
   * it explains can never come from different answers. kittiwake#8.
   */
  warmBacklog: number | null;
}
