// @vitest-environment jsdom
/**
 * What an indexer claiming a bounty sees, and the bookkeeping that follows a claim.
 *
 * Every one of these states needs a wallet, an allocation and a bounty posted on chain, so they
 * are the least-exercised screens in the Dock. Stubbing `useContractStep` is the only practical
 * way to look at them.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

import type { ContractStepStatus, MinedReceipt } from '@/hooks/useContractStep';

const step: {
  status: ContractStepStatus;
  txHash?: `0x${string}`;
  error: Error | null;
  onMined?: (r: MinedReceipt) => void;
} = { status: 'idle', error: null };

vi.mock('@/hooks/useContractStep', () => ({
  useContractStep: (opts?: { onMined?: (r: MinedReceipt) => void }) => {
    step.onMined = opts?.onMined;
    return { ...step, write: vi.fn(), receipt: undefined, reset: vi.fn() };
  },
}));

const markClaimed = vi.fn();
vi.mock('../api', () => ({
  usePresentPoi: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useMarkBountyClaimed: () => ({ mutate: markClaimed }),
}));

vi.mock('wagmi', () => ({ useReadContract: () => ({ data: undefined }) }));
vi.mock('@/lib/wallet', () => ({ CONTRACTS: { bountyBoard: '0xBB', subgraphService: '0xSS' } }));
vi.mock('@/lib/bountyBoard', () => ({ BOUNTY_BOARD_ABI: [], SUBGRAPH_SERVICE_ABI: [] }));

import { ClaimModal } from '../components/ClaimModal';

const BOUNTY = {
  id: 7,
  deployment_id: 'QmDeployment',
  subgraph_id: 1,
  developer_address: '0xdev',
  amount_grt: '100',
  message: 'please sync this',
  status: 'open' as const,
  claimed_by: null,
  claimed_at: null,
  created_at: '2026-09-01T00:00:00Z',
  expires_at: null,
  chain_bounty_id: '3',
  post_tx_hash: '0xpost',
};

function renderAt(status: ContractStepStatus, error: Error | null = null) {
  step.status = status;
  step.error = error;
  step.txHash = status === 'idle' || status === 'wallet' ? undefined : '0xabc';
  return render(<ClaimModal bounty={BOUNTY} onClose={vi.fn()} />);
}

beforeEach(() => {
  markClaimed.mockReset();
  step.status = 'idle';
  step.error = null;
  step.txHash = undefined;
});

describe('the stages an indexer sees', () => {
  it('opens on the form with the instructions', () => {
    renderAt('idle');
    expect(screen.getByText(/deploy the subgraph to your graph-node/i)).toBeTruthy();
  });

  it('says the claim is in flight', () => {
    renderAt('mining');
    expect(screen.getByText(/transaction submitted/i)).toBeTruthy();
  });

  it('says claimed only once it is', () => {
    renderAt('mining');
    expect(screen.queryByText(/bounty claimed/i)).toBeNull();

    renderAt('done');
    expect(screen.getByText(/bounty claimed/i)).toBeTruthy();
  });

  it('surfaces a revert rather than sitting on submitted', () => {
    renderAt('error', new Error('execution reverted: not the allocation owner'));
    expect(screen.getByText(/not the allocation owner/i)).toBeTruthy();
  });
});

describe('the bookkeeping after a claim', () => {
  it('records the claim once, and against the right bounty', () => {
    step.status = 'mining';
    render(<ClaimModal bounty={BOUNTY} onClose={vi.fn()} />);

    step.onMined?.({ transactionHash: '0xabc', status: 'success', logs: [] });
    expect(markClaimed).toHaveBeenCalledTimes(1);
    expect(markClaimed).toHaveBeenCalledWith(7);
  });

  it('does not record anything before the transaction is mined', () => {
    renderAt('mining');
    expect(markClaimed).not.toHaveBeenCalled();
  });
});
