// @vitest-environment jsdom
/**
 * Cancelling and refunding a bounty, which are the two places on the board that move GRT.
 *
 * Both used to end at the wallet: the row recorded the hash on broadcast and said "Cancelling..."
 * from then on. There was no wait for a receipt at all, so a cancel that reverted was
 * indistinguishable from one that worked, and the board never refetched to show otherwise.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import type { ContractStepStatus, MinedReceipt } from '@/hooks/useContractStep';

/** Both steps in the component share this, which is fine: one transaction runs at a time. */
const step: {
  status: ContractStepStatus;
  txHash?: `0x${string}`;
  error: Error | null;
  onMined?: (r: MinedReceipt) => void | Promise<void>;
} = { status: 'idle', error: null };

const write = vi.fn();

vi.mock('@/hooks/useContractStep', () => ({
  useContractStep: (opts?: { onMined?: (r: MinedReceipt) => void | Promise<void> }) => {
    step.onMined = opts?.onMined;
    return { ...step, write, receipt: undefined, reset: vi.fn() };
  },
}));

const invalidateQueries = vi.fn();
vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries }),
}));

const bounties: unknown[] = [];
vi.mock('../api', () => ({
  dockKeys: { allBounties: ['dock', 'bounties'] },
  useBounties: () => ({ data: bounties, isLoading: false, isError: false }),
}));

vi.mock('../constants', () => ({ BOUNTY_BOARD_DEPLOYED: true }));
vi.mock('@/lib/wallet', () => ({ CONTRACTS: { bountyBoard: '0xBB' } }));
vi.mock('@/lib/bountyBoard', () => ({ BOUNTY_BOARD_ABI: [] }));
vi.mock('./ClaimModal', () => ({ ClaimModal: () => null }));

// The confirm dialog is a promise; these flows are gated behind it.
const confirm = vi.fn(async () => true);
vi.mock('@/hooks/useDialog', () => ({
  useDialog: () => ({ confirm, notify: vi.fn(), dialog: null }),
}));

import { BountyBoardTab } from '../components/BountyBoardTab';

const OWNER = '0xdev0000000000000000000000000000000000dev';

/** Posted four days ago, so the 72-hour cancel lock has lifted. */
function ownBounty(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    deployment_id: 'QmDeployment',
    subgraph_id: 1,
    developer_address: OWNER,
    amount_grt: '100',
    message: null,
    status: 'open',
    claimed_by: null,
    claimed_at: null,
    created_at: new Date(Date.now() - 4 * 24 * 3600 * 1000).toISOString(),
    expires_at: null,
    chain_bounty_id: '3',
    post_tx_hash: '0xpost',
    ...overrides,
  };
}

function renderBoard(rows: unknown[], status: ContractStepStatus, error: Error | null = null) {
  bounties.length = 0;
  bounties.push(...rows);
  step.status = status;
  step.error = error;
  step.txHash = status === 'idle' || status === 'wallet' ? undefined : '0xabc';
  return render(<BountyBoardTab sessionAddress={OWNER} />);
}

beforeEach(() => {
  write.mockReset();
  invalidateQueries.mockReset();
  confirm.mockClear();
  step.status = 'idle';
  step.error = null;
  step.txHash = undefined;
});

describe('cancelling a bounty', () => {
  it('offers the button on your own unlocked bounty', () => {
    renderBoard([ownBounty()], 'idle');
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeTruthy();
  });

  it('asks before sending anything to the wallet', async () => {
    renderBoard([ownBounty()], 'idle');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(confirm).toHaveBeenCalled());
    await waitFor(() => expect(write).toHaveBeenCalled());
  });

  it('does not send anything when the confirm is declined', async () => {
    confirm.mockResolvedValueOnce(false);
    renderBoard([ownBounty()], 'idle');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(confirm).toHaveBeenCalled());
    expect(write).not.toHaveBeenCalled();
  });

  it('says cancelled only once the transaction has been mined', async () => {
    renderBoard([ownBounty()], 'mining');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.getByText(/Cancelling/)).toBeTruthy());
    expect(screen.queryByText('Cancelled')).toBeNull();
  });

  it('says the cancel failed when it reverted, rather than cancelling for ever', async () => {
    renderBoard([ownBounty()], 'error', new Error('execution reverted'));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.getByText('Cancel failed')).toBeTruthy());
  });

  it('refetches the board once the cancel is mined, so the row reflects the chain', async () => {
    renderBoard([ownBounty()], 'done');
    await step.onMined?.({ transactionHash: '0xabc', status: 'success', logs: [] });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['dock', 'bounties'] });
  });
});

describe('refunding an expired bounty', () => {
  const expired = ownBounty({
    id: 2,
    status: 'expired',
    expires_at: new Date(Date.now() - 3600 * 1000).toISOString(),
  });

  it('offers the refund on your own expired bounty', () => {
    renderBoard([expired], 'idle');
    expect(screen.getByRole('button', { name: 'Refund' })).toBeTruthy();
  });

  it('says the refund failed when it reverted', async () => {
    renderBoard([expired], 'error', new Error('execution reverted'));
    fireEvent.click(screen.getByRole('button', { name: 'Refund' }));
    await waitFor(() => expect(screen.getByText('Refund failed')).toBeTruthy());
  });
});
