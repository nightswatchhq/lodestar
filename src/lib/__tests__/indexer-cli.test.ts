import { describe, it, expect } from 'vitest';
import { queueCommand, queueBlock } from '../indexer-cli';

describe('queueCommand', () => {
  it('writes unallocate with the deployment, allocation id and network', () => {
    expect(queueCommand('unallocate', {
      deploymentId: 'QmHash',
      allocationId: '0xabc',
      network: 'arbitrum-one',
    })).toBe('graph indexer actions queue unallocate QmHash 0xabc --network arbitrum-one');
  });

  it('puts the GRT amount after the allocation id for reallocate and resize', () => {
    expect(queueCommand('reallocate', {
      deploymentId: 'QmHash',
      allocationId: '0xabc',
      amount: '50000',
    })).toBe('graph indexer actions queue reallocate QmHash 0xabc 50000 --network arbitrum-one');
  });

  it('joins a selection as one command per line', () => {
    expect(queueBlock([
      queueCommand('unallocate', { deploymentId: 'QmA', allocationId: '0x1' }),
      queueCommand('unallocate', { deploymentId: 'QmB', allocationId: '0x2' }),
    ])).toBe(
      'graph indexer actions queue unallocate QmA 0x1 --network arbitrum-one\n' +
      'graph indexer actions queue unallocate QmB 0x2 --network arbitrum-one',
    );
  });
});
