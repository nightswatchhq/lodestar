// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { IndexerDispute } from '@/hooks/useNetworkStats';

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));

// Mock the hook so the section renders synchronously with controlled data.
let mockData: IndexerDispute[] | undefined;
let mockLoading = false;
let mockError: Error | undefined;
vi.mock('@/hooks/useNetworkStats', () => ({
  useIndexerDisputes: () => ({
    data: mockData,
    isLoading: mockLoading,
    isError: mockError !== undefined,
    error: mockError,
  }),
}));

import { DisputesSection } from '../DisputesSection';

function dispute(over: Partial<IndexerDispute> = {}): IndexerDispute {
  return {
    id: 'd1', dispute_type: 'Indexing', fisherman: '0xf1', allocation_id: '0xa1',
    deployment_id: 'QmDep', status: 'Accepted', tokens_slashed_grt: '100',
    tokens_burned_grt: '25', created_at: '2026-01-01T00:00:00Z', closed_at: null,
    ...over,
  };
}

describe('DisputesSection', () => {
  /**
   * A read that did not come back is not a clean record.
   *
   * The section used to do `data?.disputes ?? []` and render "This indexer has never been disputed
   * or slashed" off the back of it, which is an absolute claim about someone's record made on the
   * strength of a request that failed.
   */
  it('says the record could not be read rather than declaring it clean', () => {
    mockData = undefined;
    mockLoading = false;
    mockError = new Error('disputes 503');
    render(<DisputesSection address="0x1" />);
    expect(screen.getByText(/could not be read/i)).toBeInTheDocument();
    expect(screen.queryByText(/never been disputed or slashed/i)).not.toBeInTheDocument();
    expect(screen.queryByText('Clean record')).not.toBeInTheDocument();
  });

  it('shows a clean-record message when there are no disputes', () => {
    mockData = []; mockLoading = false; mockError = undefined;
    render(<DisputesSection address="0x1" />);
    expect(screen.getByText(/never been disputed or slashed/i)).toBeInTheDocument();
    expect(screen.getByText('Clean record')).toBeInTheDocument();
  });

  it('renders a dispute row with type, status and slashed amount', () => {
    mockData = [dispute()]; mockLoading = false; mockError = undefined;
    render(<DisputesSection address="0x1" />);
    expect(screen.getByText('Indexing')).toBeInTheDocument();
    expect(screen.getByText('Accepted')).toBeInTheDocument();
    expect(screen.getByText(/100/)).toBeInTheDocument(); // slashed GRT
  });

  it('dashes out a zero slashed/burned amount', () => {
    mockData = [dispute({ tokens_slashed_grt: '0', tokens_burned_grt: '0', status: 'Rejected' })];
    mockLoading = false;
    mockError = undefined;
    render(<DisputesSection address="0x1" />);
    expect(screen.getByText('Rejected')).toBeInTheDocument();
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
  });
});
