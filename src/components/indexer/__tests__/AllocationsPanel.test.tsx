// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { AllocationsPanel } from '../AllocationsPanel';
import type { ActiveAllocation, ClosedAllocation } from '@/lib/contracts/indexer-detail';

const params = new URLSearchParams();
const replace = vi.fn();

vi.mock('next/navigation', () => ({
  useSearchParams: () => params,
  useRouter: () => ({ replace }),
}));
vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));

function active(): ActiveAllocation {
  return {
    id: '0xallocactive',
    allocatedTokens: '1000000000000000000000',
    createdAtEpoch: 990,
    subgraphDeployment: {
      id: '0xdep',
      ipfsHash: 'QmActiveHashAAAAAA',
      displayName: 'Live Subgraph',
      signalledTokens: '1',
      stakedTokens: '1',
    },
  };
}

function closed(): ClosedAllocation {
  return {
    id: '0xallocclosed',
    allocatedTokens: '2000000000000000000000',
    createdAtEpoch: 900,
    closedAtEpoch: 920,
    closedAt: 1_700_000_000,
    indexingRewards: '5000000000000000000',
    queryFeesCollected: '0',
    poi: '0xpoi',
    forceClosed: true,
    subgraphDeployment: { id: '0xdep', ipfsHash: 'QmClosedHashAAAAAA', displayName: 'Old Subgraph' },
  };
}

function renderPanel(extra: Record<string, string> = {}, allocations: ActiveAllocation[] = [active()]) {
  for (const k of [...params.keys()]) params.delete(k);
  for (const [k, v] of Object.entries(extra)) params.set(k, v);
  return render(
    <AllocationsPanel
      allocations={allocations}
      closedAllocations={[closed()]}
      whyAllocations="active failed"
      whyClosed="closed failed"
      statusDeployments={[{
        deploymentId: '0xdep',
        ipfsHash: 'QmActiveHashAAAAAA',
        displayName: 'Live Subgraph',
        allocatedTokens: '1000000000000000000000',
        signalledTokens: '1',
        stakedTokens: '1',
        createdAtEpoch: 990,
        status: 'synced',
        network: 'arbitrum-one',
        blocksBehind: 0,
      }]}
      statusLoading={false}
      node={{ kind: 'reachable', note: null }}
      foghornSuccess={() => null}
      currentEpoch={1000}
      epochLength={6646}
      nowSec={1_700_864_000}
      networkRatio={0.006}
    />,
  );
}

beforeEach(() => {
  replace.mockReset();
});

describe('AllocationsPanel', () => {
  it('lists active rows by default, with age', () => {
    renderPanel();
    expect(screen.getByRole('heading', { name: 'Allocations' })).toBeInTheDocument();
    expect(screen.getByText('Live Subgraph')).toBeInTheDocument();
    expect(screen.queryByText('Old Subgraph')).toBeNull();
    expect(screen.getByText(/10 ep/)).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /Ratio/ })).toBeInTheDocument();
  });

  it('shows closed rewards, the force-closed flag, and a sortable closed column', () => {
    renderPanel({ view: 'closed' });
    expect(screen.getByText('Old Subgraph')).toBeInTheDocument();
    expect(screen.getByText('force closed')).toBeInTheDocument();
    expect(screen.getByText('5.00')).toBeInTheDocument();
    expect(screen.queryByText('Live Subgraph')).toBeNull();
  });

  it('shows accrued rewards on active rows', () => {
    renderPanel({}, [{ ...active(), pendingRewards: '3802500000000000000000' }]);
    expect(screen.getByRole('columnheader', { name: /Accrued/ })).toBeInTheDocument();
    expect(screen.getByText('3.80K')).toBeInTheDocument();
  });

  it('shows a dash, not zero, where no pending rewards were read', () => {
    renderPanel();
    expect(screen.getByTitle('Pending rewards were not read for this allocation.')).toHaveTextContent(/^—$/);
  });

  it('has no accrued column in the closed view', () => {
    renderPanel({ view: 'closed' });
    expect(screen.queryByRole('columnheader', { name: /Accrued/ })).toBeNull();
  });

  it('hides the accrued column from the column picker', () => {
    renderPanel({}, [{ ...active(), pendingRewards: '3802500000000000000000' }]);
    fireEvent.click(screen.getByRole('button', { name: /Columns/ }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Accrued' }));
    expect(screen.queryByRole('columnheader', { name: /Accrued/ })).toBeNull();
    expect(screen.queryByText('3.80K')).toBeNull();
  });

  it('writes the closed view into the URL', () => {
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: 'closed' }));
    expect(replace).toHaveBeenCalled();
    const url = String(replace.mock.calls[0][0]);
    expect(url).toContain('view=closed');
  });
});
