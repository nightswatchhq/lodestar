/**
 * What the frontend actually needs from each API route.
 *
 * A status check would not have caught #114. `/api/indexers-enriched` answered `200` with a hundred
 * healthy rows throughout, while every score, APR and eligibility column on `/indexers` rendered as
 * a dash - because the payload's *shape* changed under a client that destructures it and a
 * `response.json()` cast that TypeScript cannot check at runtime. So these assert the shape, and the
 * plausibility of the values inside it, not the status code.
 *
 * Each check is `{ path, name, required, sample }`:
 *   required - dotted paths that must exist and be non-empty on the payload
 *   sample   - for a collection, dotted paths that must exist on its first element
 *
 * Add a route here the moment the frontend starts destructuring its response. A route that is only
 * ever passed through untouched does not need an entry; one whose fields are read by name does.
 */
export const CONTRACTS = [
  {
    path: '/api/indexers-enriched',
    name: 'indexer directory (score, APR, eligibility)',
    // **Assert what the client can actually consume, which is now either envelope.**
    //
    // This was first written against kittiwake's shape and passed while the page was broken - a
    // check that codified the outage. Then it was written against the *old* `{ indexers }` envelope
    // and correctly went red. #114 was then fixed on the client: `normaliseEnrichedResponse` accepts
    // both shapes, so the server legitimately still answers `{ data }` and pinning `indexers` here
    // would now fail a healthy system.
    //
    // What must stay true is that the payload carries the fields the table reads, under one of the
    // two shapes the normaliser knows. `eitherOf` is checked against the first collection found.
    eitherOf: ['indexers', 'data'],
    minRows: 20,
    sample: [
      ['id', 'address'],
      ['selfStakeGRT', 'selfStakeGrt'],
      ['delegatorAPR', 'delegatorApr'],
      ['scoreGrade', 'scoreGrade'],
      ['reoStatus', 'reoStatus'],
    ],
    coverage: [
      { field: ['score', 'score'], minPresentPct: 90 },
      { field: ['reoStatus', 'reoStatus'], minPresentPct: 90 },
    ],
  },
  {
    path: '/api/indexers?first=5',
    name: 'raw indexer list',
    collection: 'data.indexers',
    minRows: 1,
    sample: ['id', 'stakedTokens', 'indexingRewardCut'],
  },
  {
    path: '/api/network-stats',
    name: 'network stats',
    required: ['data.graphNetwork.currentEpoch', 'data.graphNetwork.totalTokensStaked'],
  },
  {
    path: '/api/epochs?count=3',
    name: 'epochs',
    collection: 'data.epoches',
    minRows: 1,
    sample: ['id'],
  },
  {
    path: '/api/curators?first=5',
    name: 'curators',
    collection: 'data',
    minRows: 1,
    sample: ['id'],
  },
  {
    path: '/api/delegation-events',
    name: 'delegation events',
    collection: 'data.delegationEvents',
    minRows: 1,
    sample: ['delegator'],
  },
  {
    path: '/api/developer-activity',
    name: 'developer activity',
    required: ['data.totalInWindow'],
  },
  {
    path: '/api/delegate/recommend',
    name: 'delegate recommendation',
    // #114: this answered 503 "Indexer data not yet available" while /delegate rendered an explainer
    // with no form and no error, so the page looked intact and could not delegate.
    required: ['indexer'],
  },
  { path: '/api/grt-flow', name: 'GRT flow', required: ['data'] },
  { path: '/api/chain-lag', name: 'chain lag', required: ['data'] },
  { path: '/api/dips', name: 'DIPS', required: ['data'] },
  { path: '/api/feed', name: 'activity feed', collection: 'items', minRows: 1, sample: ['id'] },
  { path: '/api/price', name: 'GRT price', required: ['price'] },
];

/** Routes that must answer at all. Status only - nothing destructures these. */
export const LIVENESS = [
  '/api/health',
  '/api/subgraph-deployments',
  '/api/indexers-enriched',
  '/api/sql/catalog',
  '/api/payments',
  '/api/migration',
  '/api/tvl',
  '/api/token-metrics',
  '/api/scuttlebutt/messages',
  '/api/studio/bounties',
  '/api/provider-liveness',
  '/api/horizon/activity',
  '/api/delegation-flows',
  '/api/subgraph-fees-30d',
  '/api/indexers-enriched',
];

/** Pages that must render real content, with a string that only appears once data has arrived. */
export const PAGES = [
  { path: '/', name: 'home', mustContain: ['Total Staked', 'Current Epoch'] },
  { path: '/network', name: 'state of network', mustContain: ['Protocol utilization', 'Total Staked'] },
  { path: '/indexers', name: 'indexer directory', mustContain: ['Indexer Directory'] },
  { path: '/delegate', name: 'delegate', mustContain: ['Delegate GRT'] },
  { path: '/curators', name: 'curators', mustContain: [] },
  { path: '/subgraphs', name: 'subgraphs', mustContain: [] },
  { path: '/payments', name: 'payments', mustContain: [] },
  { path: '/grt-flow', name: 'grt flow', mustContain: [] },
  { path: '/indexing', name: 'indexing status', mustContain: [] },
  { path: '/delegators', name: 'delegators', mustContain: [] },
];

/** The health endpoint's own verdict is a check in its own right (lodestar#112). */
export const HEALTH = { path: '/api/health', mustBe: 'healthy' };
