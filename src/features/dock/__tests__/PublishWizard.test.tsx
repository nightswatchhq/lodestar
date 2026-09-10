// @vitest-environment jsdom
/**
 * What the publish wizard shows at each stage of a transaction.
 *
 * These states are all behind a wallet, so nobody sees them without signing something and paying
 * gas on Arbitrum. That made them the least-verified code in the Dock, and it is the reason the
 * hooks were pulled out first: `useContractStep` is now the seam, so every stage can be rendered
 * by stubbing one thing.
 *
 * The assertion that matters most is the last one. `onPublished` writes to the database, and until
 * recently it was called from an effect keyed on a boolean, so a re-render could call it twice.
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

vi.mock('../api', () => ({
  useUploadMetadata: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock('@/lib/wallet', () => ({ CONTRACTS: { gns: '0xGNS' } }));
vi.mock('@/lib/studio/ipfs', () => ({ ipfsHashToBytes32: (h: string) => `0x${h}` }));

import { PublishWizard } from '../components/PublishWizard';

const SG = {
  id: 1,
  owner_address: '0xowner',
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

function renderAt(status: ContractStepStatus, error: Error | null = null) {
  step.status = status;
  step.error = error;
  step.txHash = status === 'idle' || status === 'wallet' ? undefined : '0xabc';
  return render(<PublishWizard sg={SG} onClose={vi.fn()} onPublished={vi.fn()} />);
}

beforeEach(() => {
  step.status = 'idle';
  step.error = null;
  step.txHash = undefined;
});

describe('the stages a publisher sees', () => {
  it('opens on the confirmation, not on a wallet prompt', () => {
    renderAt('idle');
    expect(screen.getByText(/my-subgraph/i)).toBeTruthy();
  });

  it('says the transaction is waiting to be mined', () => {
    renderAt('mining');
    expect(screen.getByText(/waiting for confirmation/i)).toBeTruthy();
  });

  it('says it published, and does not say it while still mining', () => {
    renderAt('mining');
    expect(screen.queryByText(/^Published!$/)).toBeNull();

    renderAt('done');
    expect(screen.getByText(/Published!/)).toBeTruthy();
  });

  it('shows the reason a transaction failed rather than a spinner', () => {
    // The state that did not exist before useContractStep: the old effect watched isSuccess alone,
    // so a rejected signature left this on "waiting for confirmation" for ever.
    renderAt('error', new Error('User rejected the request'));
    expect(screen.getByText(/rejected/i)).toBeTruthy();
    expect(screen.getByText('Try Again')).toBeTruthy();
  });
});

describe('onPublished', () => {
  it('is handed the subgraph id parsed out of the receipt, not the transaction hash', () => {
    // A first publish mints an ERC-721 and the id is only in the Transfer log. Handing back the
    // hash instead would store something that looks plausible and is not a subgraph id.
    const onPublished = vi.fn();
    step.status = 'mining';
    render(<PublishWizard sg={SG} onClose={vi.fn()} onPublished={onPublished} />);

    const TRANSFER = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
    const ZERO = '0x0000000000000000000000000000000000000000000000000000000000000000';
    step.onMined?.({
      transactionHash: '0xabc',
      status: 'success',
      logs: [
        {
          address: '0xGNS',
          topics: [TRANSFER, ZERO, '0xto', '0x000000000000000000000000000000000000000000000000000000000000002a'],
          data: '0x',
        },
      ],
    });

    expect(onPublished).toHaveBeenCalledTimes(1);
    expect(onPublished.mock.calls[0][0]).toBe('42');
  });

  it('falls back to the hash when no mint log is present, rather than an empty string', () => {
    const onPublished = vi.fn();
    step.status = 'mining';
    render(<PublishWizard sg={SG} onClose={vi.fn()} onPublished={onPublished} />);

    step.onMined?.({ transactionHash: '0xabc', status: 'success', logs: [] });
    expect(onPublished.mock.calls[0][0]).toBe('0xabc');
  });
});
