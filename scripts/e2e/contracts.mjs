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
  { path: '/api/price', name: 'GRT price', required: ['price'] },

  // ---------------------------------------------------------------------------------------------
  // The rest of what the frontend destructures.
  //
  // Added after #114 and the null-name crash, when twenty-one `fetch*` helpers in `src/lib/api.ts`
  // declared a named return type and then handed back `response.json()` unchecked - the same gap
  // that let `/api/indexers-enriched` change contract silently and render a table of dashes for a
  // day.
  //
  // Those helpers now parse rather than cast (`src/lib/contract.ts`, #124), so the client refuses a
  // payload it cannot read. **These checks are still the other half.** The parser prevents a bad
  // payload reaching a render; it runs only when a browser asks, so it cannot tell anyone that a
  // route has changed until somebody visits the page. These run every fifteen minutes whether or
  // not anyone is looking. Keep the two lists in step: a route that changes shape wants both
  // updating, and the vocabularies were kept deliberately alike so they can be compared by eye.
  //
  // `{address}` and `{hash}` are substituted from live data at run time rather than hardcoded, so a
  // fixture indexer leaving the network does not red the monitor for the wrong reason.
  // ---------------------------------------------------------------------------------------------
  { path: '/api/payments', name: 'payments', required: ['data.totalCollected', 'data.activePayers', 'data.escrowAccounts'] },
  { path: '/api/poi', name: 'POI overview', required: ['data.summary', 'data.deployments'] },
  // **This one is red on purpose.** `/poi/[deployment]` reads `detail.epochs.reduce(...)`, and since
  // `/api/poi` moved to kittiwake the `?deployment=` parameter has been ignored: the route answers
  // the overview shape (`{ deployments, summary }`) filtered to one row, with no `epochs`. The page
  // is a client-side `TypeError: Cannot read properties of undefined (reading 'reduce')` and renders
  // "Something went wrong". Nothing was watching that route's detail form, which is why it went
  // unnoticed. Loosening this to match what kittiwake currently sends would codify the outage, which
  // is the mistake the `/api/indexers-enriched` entry above records. It goes green when the backend
  // honours the parameter again.
  { path: '/api/poi?deployment={poiDeployment}', name: 'POI deployment detail', required: ['data.deploymentId', 'data.epochs'] },
  { path: '/api/portfolio?address={address}', name: 'delegator portfolio', required: ['data.delegator', 'data.networkParams'] },
  { path: '/api/provisions?indexer={address}', name: 'provisions', required: ['data.provisions'] },
  { path: '/api/rewards-history?address={address}', name: 'rewards history', required: ['history'] },
  { path: '/api/indexer-stake-history/{address}', name: 'indexer stake history', required: ['data.history'] },
  { path: '/api/apr-provenance/{address}', name: 'APR provenance', required: ['data.events', 'data.reconcile'] },
  { path: '/api/indexing-status/{hash}', name: 'indexing status', required: ['data.deploymentId', 'data.indexers'] },
  { path: '/api/subgraph-curation/{hash}', name: 'subgraph curation', required: ['data.totalSignalledTokens', 'data.signals'] },
  { path: '/api/subgraph-schema/{hash}', name: 'subgraph schema', required: ['data.schemaText'] },
  { path: '/api/manifest?hash={hash}', name: 'manifest analysis', required: ['data.dataSources', 'data.network'] },
  { path: '/api/developer-activity', name: 'developer activity weeks', required: ['data.weeks', 'data.totalInWindow'] },
  { path: '/api/dips', name: 'DIPS detail', required: ['data.live', 'data.allocations'] },
  { path: '/api/grt-flow', name: 'GRT flow detail', required: ['data.allocated', 'data.delegated'] },
  { path: '/api/chain-lag', name: 'chain lag detail', required: ['data.chains'] },
  { path: '/api/network-stats', name: 'network stats detail', required: ['data.graphNetwork', 'data.grtSupply'] },
  { path: '/api/subgraph-deployments', name: 'subgraph deployments', required: ['data'] },
  { path: '/api/token-metrics', name: 'token metrics', required: ['data'] },
  { path: '/api/tvl', name: 'TVL', required: ['tvl'] },
];

/** Routes that must answer at all. Status only - nothing destructures these. */
export const LIVENESS = [
  '/api/health',
  '/api/subgraph-deployments',
  '/api/indexers-enriched',
  '/api/sql/catalog',
  '/api/payments',
  '/api/tvl',
  '/api/token-metrics',
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
