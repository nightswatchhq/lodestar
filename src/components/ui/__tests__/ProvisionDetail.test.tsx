// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ProvisionDetail } from '../ProvisionDetail';
import type { ProvisionDetailResponse, ProvisionDetailService } from '@/lib/queries';

const SS = '0xb2bb92d0de618878e438b55d5846cfecd9301105';

const service = (over: Partial<ProvisionDetailService> = {}): ProvisionDetailService => ({
  dataService: SS,
  tokensProvisioned: '5702846251654524944924321',
  tokensThawing: '903015421465778528733130',
  maxVerifierCut: '500000',
  thawingPeriod: '2419200',
  maxVerifierCutPending: null,
  thawingPeriodPending: null,
  thawingPeriodRange: null,
  verifierCutRange: null,
  delegationFeeCuts: { queryFee: null, indexingFee: null, indexingRewards: null },
  thawRequestCount: null,
  thawRequests: [
    {
      id: '0xd6',
      shares: '598061686197227321535683',
      tokens: null,
      thawingUntil: 1790264157,
      createdAt: 1787844957,
      txHash: null,
      nonce: '0',
      valid: null,
    },
  ],
  ...over,
});

const ready = (data: ProvisionDetailResponse) => ({ kind: 'ready' as const, data });

describe('ProvisionDetail', () => {
  it('shows what the chain did not answer as unavailable, never as zero', () => {
    render(
      <ProvisionDetail
        nowSec={1789000000}
        state={ready({ indexer: '0x0e', chain: null, services: [service()], activity: [], degraded: [{ part: 'chain', reason: 'unavailable' }] })}
      />,
    );
    expect(screen.getByText('contract reads unavailable')).toBeInTheDocument();
    // Three fee cuts, two ranges and the request's amount.
    expect(screen.getAllByText('unavailable').length).toBe(6);
    expect(screen.queryByText('0.00%')).toBeNull();
    expect(screen.queryByText(/^0(\.00)? GRT$/)).toBeNull();
    expect(screen.getByText('50.00%')).toBeInTheDocument();
    expect(screen.getByText(/left$/)).toBeInTheDocument();
  });

  it('prices requests, flags a slash and a lagging index when the chain was read', () => {
    render(
      <ProvisionDetail
        nowSec={1791000000}
        state={ready({
          indexer: '0x0e',
          chain: { block: 508140119, readAt: 0 },
          services: [
            service({
              delegationFeeCuts: { queryFee: 100000, indexingFee: 0, indexingRewards: 100000 },
              thawingPeriodRange: { min: '1209600', max: '18446744073709551615' },
              thawRequestCount: 3,
              thawRequests: [
                { ...service().thawRequests[0], tokens: '598061686197227321535683', valid: true },
                { ...service().thawRequests[0], id: '0x06', tokens: '0', valid: false },
              ],
            }),
          ],
          activity: [],
        })}
      />,
    );
    expect(screen.getByText('14d or more')).toBeInTheDocument();
    expect(screen.getAllByText('10.00%').length).toBe(2);
    expect(screen.getByText('Ready to deprovision')).toBeInTheDocument();
    expect(screen.getByText('Invalidated by a slash')).toBeInTheDocument();
    expect(screen.getByText(/HorizonStaking lists 3 pending; the index shows 2/)).toBeInTheDocument();
  });

  it('does not turn a failed read into "none pending"', () => {
    render(<ProvisionDetail nowSec={0} state={{ kind: 'failed', error: new Error('Provision detail failed: 404') }} />);
    expect(screen.queryByText('None pending.')).toBeNull();
    expect(screen.getByText(/could not be loaded/)).toBeInTheDocument();
  });
});
