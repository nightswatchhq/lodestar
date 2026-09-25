// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ComponentProps } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { IndexerCompactHeader } from '../IndexerCompactHeader';

const writeText = vi.fn();

beforeEach(() => {
  writeText.mockReset().mockResolvedValue(undefined);
  Object.defineProperty(globalThis.navigator, 'clipboard', {
    value: { writeText },
    configurable: true,
    writable: true,
  });
});
const INDEXER = '0x1234567890abcdef1234567890abcdef12345678';

function renderHeader(
  overrides: Partial<ComponentProps<typeof IndexerCompactHeader>> = {},
) {
  return render(
    <IndexerCompactHeader
      name="p-ops2.eth"
      address={INDEXER}
      reoStatus={{ status: 'eligible', daysRemaining: 12 }}
      availableGRT={500_000}
      provisionedGRT={1_000_000}
      allocatedGRT={400_000}
      delegatedGRT={2_100_000}
      allocationRatio={0.4}
      statedCutPPM={150_000}
      effectiveCutPercent={12.3}
      rollingAPY30d={8.4}
      {...overrides}
    />,
  );
}

describe('IndexerCompactHeader', () => {
  it('shows name and available stake as the large figure', () => {
    renderHeader();
    expect(screen.getByRole('heading', { name: 'p-ops2.eth' })).toBeInTheDocument();
    expect(screen.getByText('500.00K')).toBeInTheDocument();
    expect(screen.getByText('Available')).toBeInTheDocument();
  });

  it('copies available stake as a plain number, not the abbreviated display', async () => {
    renderHeader();
    fireEvent.click(screen.getByRole('button', { name: 'Copy available stake' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('500000'));
  });

  it('copies the full address, not the shortened display', async () => {
    renderHeader();
    fireEvent.click(screen.getByRole('button', { name: 'Copy address' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(INDEXER));
  });

  it('shows a real zero when the SubgraphService provision is empty', () => {
    renderHeader({ availableGRT: 0, provisionedGRT: 0, allocatedGRT: 0, allocationRatio: null });
    expect(screen.getByText('0.00')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy available stake' })).toBeInTheDocument();
  });

  it('does not claim zero available when the provision could not be read', () => {
    renderHeader({
      availableGRT: null,
      provisionedGRT: null,
      allocatedGRT: null,
      allocationRatio: null,
    });
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
    expect(screen.queryByText('0.00')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Copy available stake' })).toBeNull();
  });

  it('shows effective against stated reward cut, and 30d APY', () => {
    renderHeader();
    expect(screen.getByText('12.30% / 15.00%')).toBeInTheDocument();
    expect(screen.getByText('8.40%')).toBeInTheDocument();
    expect(screen.getByText('40.0%')).toBeInTheDocument();
  });

  it('says accrued rewards are unavailable rather than zero when none were read', () => {
    renderHeader();
    expect(screen.getByText('unavailable')).toBeInTheDocument();
    expect(screen.queryByText('0.00 GRT')).not.toBeInTheDocument();
  });

  it('shows the accrued total, marked when some rows were not read', () => {
    renderHeader({ accrued: { kind: 'ready', wei: 3802500000000000000000n, unread: 2 } });
    expect(screen.getByText('3.80K+ GRT')).toBeInTheDocument();
    expect(screen.getByText('3.80K+ GRT').closest('[title]')).toHaveAttribute(
      'title',
      expect.stringContaining('2 allocations could not be read'),
    );
  });

  it('shows the REO badge', () => {
    renderHeader();
    expect(screen.getByText('Eligible')).toBeInTheDocument();
  });

  it('sticks under the site topbar', () => {
    const { container } = renderHeader();
    expect(container.firstChild).toHaveClass(
      'sticky',
      'top-[calc(var(--safe-top)+var(--topbar-height))]',
    );
  });
});
