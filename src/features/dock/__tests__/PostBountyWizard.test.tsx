// @vitest-environment jsdom
/**
 * The only two-transaction flow in the Dock, and the one with the most ways to mislead.
 *
 * Approve, then post. Two `useContractStep` instances, and the wizard's step is derived from both,
 * so it has to get the precedence right: once posting has started, the approval being finished is
 * history rather than the current state. Getting that backwards would show "waiting for approval"
 * while GRT was being locked.
 *
 * The bookkeeping assertion is the load-bearing one. Recording the bounty is a POST, and the
 * effect this replaced both suppressed exhaustive-deps and keyed on a boolean, so a re-render
 * could write the row twice.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

import type { ContractStepStatus, MinedReceipt } from '@/hooks/useContractStep';

interface Stub {
  status: ContractStepStatus;
  txHash?: `0x${string}`;
  error: Error | null;
  onMined?: (r: MinedReceipt) => void;
}
const approve: Stub = { status: 'idle', error: null };
const post: Stub = { status: 'idle', error: null };

// Two instances in declaration order: approve first, post second.
let call = 0;
vi.mock('@/hooks/useContractStep', () => ({
  useContractStep: (opts?: { onMined?: (r: MinedReceipt) => void }) => {
    const which = call++ % 2 === 0 ? approve : post;
    which.onMined = opts?.onMined;
    return { ...which, write: vi.fn(), receipt: undefined, reset: vi.fn() };
  },
}));

const recordBounty = vi.fn().mockResolvedValue({});
vi.mock('../api', () => ({ useRecordBounty: () => ({ mutateAsync: recordBounty }) }));

vi.mock('wagmi', () => ({
  useAccount: () => ({ address: '0xme' }),
  useReadContract: () => ({ data: 0n, refetch: vi.fn() }),
}));
vi.mock('@/lib/wallet', () => ({ CONTRACTS: { bountyBoard: '0xBB', grt: '0xGRT' } }));
vi.mock('@/lib/bountyBoard', () => ({
  BOUNTY_BOARD_ABI: [],
  GRT_ABI: [],
  extractBountyId: () => 99n,
}));
vi.mock('../constants', () => ({ BOUNTY_BOARD_DEPLOYED: true }));

import { PostBountyWizard } from '../components/PostBountyWizard';

const SG = {
  id: 1,
  owner_address: '0xme',
  slug: 'my-subgraph',
  display_name: 'My Subgraph',
  description: null,
  deployment_id: 'QmDeployment',
  network: 'mainnet',
  published_subgraph_id: null,
  version_label: null,
  last_published_deployment_id: null,
  created_at: '2026-09-01T00:00:00Z',
  updated_at: '2026-09-01T00:00:00Z',
};

function renderWizard() {
  call = 0;
  return render(<PostBountyWizard sg={SG} sessionAddress="0xme" onClose={vi.fn()} />);
}

function reset(s: Stub) {
  s.status = 'idle';
  s.error = null;
  s.txHash = undefined;
}

beforeEach(() => {
  recordBounty.mockClear();
  reset(approve);
  reset(post);
});

describe('the two transactions', () => {
  it('says it is waiting on the approval while the approval is mining', () => {
    approve.status = 'mining';
    renderWizard();
    expect(screen.getByText(/waiting for approval confirmation/i)).toBeTruthy();
  });

  it('says it is locking GRT once the post is mining, not still waiting on the approval', () => {
    // The precedence that matters: the approval is 'done' by this point and saying so would be
    // describing a step the user has already left.
    approve.status = 'done';
    post.status = 'mining';
    renderWizard();
    expect(screen.getByText(/locking grt on-chain/i)).toBeTruthy();
    expect(screen.queryByText(/waiting for approval confirmation/i)).toBeNull();
  });

  it('says posted only when the post is done', () => {
    approve.status = 'done';
    post.status = 'done';
    renderWizard();
    expect(screen.getByText(/bounty posted/i)).toBeTruthy();
  });

  it('surfaces a failure from either transaction', () => {
    approve.status = 'error';
    approve.error = new Error('User rejected the request');
    renderWizard();
    expect(screen.getByText(/rejected/i)).toBeTruthy();
  });
});

describe('recording the bounty', () => {
  it('writes the row once, with the id parsed from the receipt and the real transaction hash', () => {
    post.status = 'mining';
    renderWizard();

    post.onMined?.({ transactionHash: '0xposted', status: 'success', logs: [] });

    expect(recordBounty).toHaveBeenCalledTimes(1);
    expect(recordBounty.mock.calls[0][0]).toMatchObject({
      deployment_id: 'QmDeployment',
      chain_bounty_id: '99',
      post_tx_hash: '0xposted',
    });
  });

  it('writes nothing when the approval mines, only when the post does', () => {
    approve.status = 'mining';
    renderWizard();
    approve.onMined?.({ transactionHash: '0xapproved', status: 'success', logs: [] });
    expect(recordBounty).not.toHaveBeenCalled();
  });
});
