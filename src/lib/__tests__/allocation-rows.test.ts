import { describe, it, expect } from 'vitest';
import type { ActiveAllocation } from '@/lib/contracts/indexer-detail';
import { allocationsWithStatus, type StatusDeployment } from '../allocation-rows';

const DEP = '0xdeploy00000000000000000000000000000000000000000000000000000000001';

function alloc(id: string, allocated: string, deploymentId = DEP): ActiveAllocation {
  return {
    id,
    allocatedTokens: allocated,
    createdAtEpoch: 1,
    subgraphDeployment: {
      id: deploymentId,
      ipfsHash: 'QmHashAAAA',
      displayName: 'a subgraph',
      signalledTokens: '1000',
      stakedTokens: '2000',
    },
  };
}

function status(over: Partial<StatusDeployment> = {}): StatusDeployment {
  return {
    deploymentId: DEP,
    ipfsHash: 'QmHashAAAA',
    displayName: 'a subgraph',
    allocatedTokens: '999',
    signalledTokens: '1000',
    stakedTokens: '2000',
    createdAtEpoch: 1,
    status: 'synced',
    ...over,
  };
}

describe('allocationsWithStatus', () => {
  it('joins node status onto the allocation, and keeps the allocation amount', () => {
    const rows = allocationsWithStatus(
      [alloc('0xalloc1', '5000000000000000000000')],
      [status({ status: 'synced', blocksBehind: 0 })],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].allocationId).toBe('0xalloc1');
    expect(rows[0].status).toBe('synced');
    expect(rows[0].blocksBehind).toBe(0);
    expect(rows[0].allocatedTokens).toBe('5000000000000000000000');
  });

  it('emits two rows when two allocations share a deployment', () => {
    const rows = allocationsWithStatus(
      [alloc('0xalloc1', '1'), alloc('0xalloc2', '2')],
      [status({ status: 'syncing' })],
    );
    expect(rows.map((r) => r.allocationId)).toEqual(['0xalloc1', '0xalloc2']);
    expect(rows.map((r) => r.allocatedTokens)).toEqual(['1', '2']);
    expect(rows.every((r) => r.status === 'syncing')).toBe(true);
  });

  it('still lists the allocation when status has not arrived', () => {
    const rows = allocationsWithStatus([alloc('0xalloc1', '1')], undefined);
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('unreachable');
    expect(rows[0].ipfsHash).toBe('QmHashAAAA');
  });

  it('does not invent a row from a status deployment with no allocation', () => {
    expect(allocationsWithStatus([], [status()])).toEqual([]);
  });
});
