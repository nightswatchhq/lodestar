// @vitest-environment jsdom
/**
 * The three GNS write flows, and the two things this panel used to get wrong about them.
 *
 * It said "Ownership transferred" for a transaction that reverted, and it dropped the publish link
 * while doing so. And it persisted behind a `.catch(() => {})`, so a PATCH that failed looked
 * exactly like one that worked. Both needed a wallet and a published subgraph to reach, which is
 * why neither was ever noticed.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import type { ContractStepStatus, MinedReceipt } from '@/hooks/useContractStep';

const step: {
  status: ContractStepStatus;
  txHash?: `0x${string}`;
  error: Error | null;
  onMined?: (r: MinedReceipt) => void | Promise<void>;
} = { status: 'idle', error: null };

vi.mock('@/hooks/useContractStep', () => ({
  useContractStep: (opts?: { onMined?: (r: MinedReceipt) => void | Promise<void> }) => {
    step.onMined = opts?.onMined;
    return { ...step, write: vi.fn(), receipt: undefined, reset: vi.fn() };
  },
}));

vi.mock('wagmi', () => ({ useAccount: () => ({ address: '0xowner' }) }));
vi.mock('@/lib/wallet', () => ({ CONTRACTS: { gns: '0xGNS' } }));

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

import { SubgraphLifecyclePanel } from '../components/SubgraphLifecyclePanel';

const SUBGRAPH = {
  id: 12,
  display_name: 'A subgraph',
  description: 'does things',
  published_subgraph_id: '42',
  version_label: 'v0.0.1',
  last_published_deployment_id: 'QmDeployment',
} as never;

/** The modal is behind the panel's buttons, so each case opens one. */
function openAt(
  kind: 'Update Metadata On-Chain' | 'Transfer Ownership' | 'Deprecate',
  status: ContractStepStatus,
  error: Error | null = null,
) {
  step.status = status;
  step.error = error;
  step.txHash = status === 'idle' || status === 'wallet' ? undefined : '0xabc';
  // The panel calls the Dock's own client now rather than writing the two requests out again, so
  // it needs the provider those hooks live under.
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const view = render(
    <QueryClientProvider client={qc}>
      <SubgraphLifecyclePanel
        sg={SUBGRAPH}
        displayName="A subgraph"
        description="does things"
        onUpdated={vi.fn()}
      />
    </QueryClientProvider>,
  );
  fireEvent.click(screen.getByRole('button', { name: kind }));
  return view;
}

beforeEach(() => {
  mockFetch.mockReset();
  mockFetch.mockResolvedValue({ ok: true, status: 200, statusText: 'OK', json: async () => ({}) });
  step.status = 'idle';
  step.error = null;
  step.txHash = undefined;
  step.onMined = undefined;
});

describe('what the owner is told', () => {
  it('does not claim the action happened while it is still mining', () => {
    openAt('Transfer Ownership', 'mining');
    expect(screen.queryByText(/ownership transferred/i)).toBeNull();
    expect(screen.getByText(/waiting for confirmation/i)).toBeTruthy();
  });

  it('shows the failure rather than a success, when the chain refused', () => {
    openAt('Transfer Ownership', 'error', new Error('execution reverted: not the owner'));
    expect(screen.getByText(/not the owner/i)).toBeTruthy();
  });
});

describe('the record kept after the transaction', () => {
  it('reports a PATCH that failed, and says which of the two it was', async () => {
    // The `.catch(() => {})` this replaced meant a 500 here and a 200 here were the same screen.
    // The transaction is already on chain, so the message has to separate the two or the reader
    // concludes the transfer reverted.
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      json: async () => ({}),
    });
    openAt('Transfer Ownership', 'done');

    const run = step.onMined?.({ transactionHash: '0xabc', status: 'success', logs: [] });
    await expect(run).rejects.toThrow(/could not record it/);
    await expect(run).rejects.toThrow(/transaction went through/i);
    await expect(run).rejects.toThrow(/chain is the source of truth/i);
  });

  /**
   * Why going through `studioFetch` is worth the provider.
   *
   * kittiwake answers `{ error: "<code>", message: "<what went wrong>" }` where the code is a
   * machine token. The copy of this request that used to live in the panel reported the status and
   * nothing else, so the owner of a subgraph got "HTTP 409" where the route had said what the
   * conflict was.
   */
  it('surfaces what the route said rather than the status code', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 409,
      statusText: 'Conflict',
      json: async () => ({ error: 'conflict', message: 'That subgraph belongs to someone else.' }),
    });
    openAt('Transfer Ownership', 'done');

    const run = step.onMined?.({ transactionHash: '0xabc', status: 'success', logs: [] });
    await expect(run).rejects.toThrow(/belongs to someone else/);
    // Not the machine token, which is what reading `error` first would have shown.
    await expect(run).rejects.not.toThrow(/conflict\./);
  });

  it('records the transfer when the PATCH succeeds', async () => {
    openAt('Transfer Ownership', 'done');

    await step.onMined?.({ transactionHash: '0xabc', status: 'success', logs: [] });
    const [url, init] = mockFetch.mock.calls[0];
    expect(String(url)).toContain('/api/studio/subgraphs/12');
    expect(init.method).toBe('PATCH');
    // The NFT is someone else's now, so the local publish link goes.
    expect(JSON.parse(init.body).published_subgraph_id).toBe('');
  });

  it('records nothing at all until a transaction is mined', async () => {
    openAt('Transfer Ownership', 'mining');
    await waitFor(() => expect(mockFetch).not.toHaveBeenCalled());
  });
});
