// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DelegatorsTable } from '../DelegatorsTable';
import type { IndexerDetail } from '@/lib/contracts/indexer-detail';

const delegatorsQuery = vi.fn();

vi.mock('@/hooks/useNetworkStats', () => ({
  useIndexerDelegators: () => delegatorsQuery(),
  useENSName: () => ({ data: undefined }),
}));
vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));

const addr = (n: number) => `0x${n.toString(16).padStart(40, '0')}`;

function indexer(delegators: number | undefined): IndexerDetail {
  return {
    id: addr(999),
    delegatorShares: '1000',
    delegatedTokens: '2000',
    delegators:
      delegators === undefined
        ? undefined
        : Array.from({ length: delegators }, (_, i) => ({
            id: `${addr(i + 1)}-x`,
            stakedTokens: '1',
            shareAmount: String(i + 1),
            delegator: { id: addr(i + 1) },
          })),
  } as IndexerDetail;
}

beforeEach(() => delegatorsQuery.mockReset());

describe('DelegatorsTable', () => {
  it('says the capped list is partial when kittiwake does not serve the route', () => {
    delegatorsQuery.mockReturnValue({ data: null, isPending: false, isError: false });
    render(<DelegatorsTable address={addr(999)} indexer={indexer(100)} nowSec={1_800_000_000} />);
    expect(screen.getByText(/not every delegator/)).toBeTruthy();
    expect(screen.getByText('Showing 1–25 of 100')).toBeTruthy();
  });

  it('says why when the full list failed rather than was absent', () => {
    delegatorsQuery.mockReturnValue({ data: undefined, isPending: false, isError: true });
    render(<DelegatorsTable address={addr(999)} indexer={indexer(3)} nowSec={1_800_000_000} />);
    expect(screen.getByText(/could not be read/)).toBeTruthy();
    expect(screen.getByText(/is every delegator/)).toBeTruthy();
  });

  it('shows the served page with its total and no fallback note', () => {
    delegatorsQuery.mockReturnValue({
      isPending: false,
      isError: false,
      data: {
        delegators: [
          {
            id: 'x',
            delegator: { id: addr(1) },
            shareAmount: '500',
            currentTokens: '1000000000000000000000',
            totalDelegatedTokens: '1000000000000000000000',
            thawingTokens: '5000000000000000000',
            thawingUntil: 1_900_000_000,
            lockedTokens: '0',
            delegatedAt: 1_700_000_000,
            lastChangeAt: 1_750_000_000,
          },
        ],
        total: 106652,
        active: 106544,
        pool: { delegatorShares: '1000', delegatedTokens: '2000' },
      },
    });
    render(<DelegatorsTable address={addr(999)} indexer={indexer(100)} nowSec={1_800_000_000} />);
    expect(screen.queryByText(/not every delegator/)).toBeNull();
    expect(screen.getByText('106,544 delegating, 108 more with tokens thawing')).toBeTruthy();
    expect(screen.getByText('Showing 1–25 of 106652')).toBeTruthy();
    expect(screen.getByText('50.00%')).toBeTruthy();
    expect(screen.getByText('until 2030-03-17')).toBeTruthy();
  });

  it('names the failure when there is nothing to fall back to', () => {
    delegatorsQuery.mockReturnValue({ data: null, isPending: false, isError: false });
    render(<DelegatorsTable address={addr(999)} indexer={indexer(undefined)} nowSec={1_800_000_000} />);
    expect(screen.getByText(/The delegator list/)).toBeTruthy();
  });
});
