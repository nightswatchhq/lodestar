/** indexer-cli v0.25 action-queue lines. Amounts are GRT. The action is unallocate, not close. */

export type IndexerCliAction = 'unallocate' | 'reallocate' | 'present-poi' | 'resize' | 'allocate';

export function queueCommand(
  action: IndexerCliAction,
  opts: {
    deploymentId: string;
    allocationId?: string;
    amount?: string;
    network?: string;
  },
): string {
  const network = opts.network || 'arbitrum-one';
  const parts = ['graph', 'indexer', 'actions', 'queue', action, opts.deploymentId];
  if (action !== 'allocate') {
    if (!opts.allocationId) throw new Error(`${action} needs an allocation ID`);
    parts.push(opts.allocationId);
  }
  if (action === 'reallocate' || action === 'resize' || action === 'allocate') {
    if (!opts.amount) throw new Error(`${action} needs an amount in GRT`);
    parts.push(opts.amount);
  }
  parts.push('--network', network);
  return parts.join(' ');
}

export function queueBlock(lines: string[]): string {
  return lines.join('\n');
}
