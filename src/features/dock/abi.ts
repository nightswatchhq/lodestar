/**
 * The GNS fragment the Dock publishes through.
 *
 * Two entrypoints and nothing else. The full ABI is enormous and none of the rest is reachable
 * from a browser, so carrying it would be shipping bytes nobody calls.
 */
export const GNS_ABI = [
  {
    name: 'publishNewSubgraph',
    type: 'function' as const,
    stateMutability: 'nonpayable' as const,
    inputs: [
      { name: 'subgraphDeploymentID', type: 'bytes32' },
      { name: 'versionMetadata', type: 'bytes32' },
      { name: 'subgraphMetadata', type: 'bytes32' },
    ],
    outputs: [],
  },
  {
    name: 'publishNewVersion',
    type: 'function' as const,
    stateMutability: 'nonpayable' as const,
    inputs: [
      { name: 'subgraphID', type: 'uint256' },
      { name: 'subgraphDeploymentID', type: 'bytes32' },
      { name: 'versionMetadata', type: 'bytes32' },
    ],
    outputs: [],
  },
] as const;