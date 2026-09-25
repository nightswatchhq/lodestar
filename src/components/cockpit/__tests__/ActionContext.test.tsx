// @vitest-environment jsdom
/**
 * The queue's context column against responses captured from production on 2026-09-25 and trimmed
 * to one allocation, so the real parsers see the real shapes.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import fixture from './fixtures/context.json';

vi.mock('wagmi', () => ({ useAccount: () => ({}), useSignMessage: () => ({}) }));
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams() }));

const INDEXER = '0x2b3c7d1ef5fdfc0557934019c531d3e70d6200ae';
const HASH = 'QmU2JpwbrNwgNC8jwz3sQJhBoiDVLgi53j88HtTeTLBKWj';
const ALLOC = '0x0069792c64e8df1583edbe164707d83e2604f4e7';

const action = (id: number, type: string, extra: object) => ({
  id, type, status: 'queued', deploymentID: HASH, allocationID: null, amount: null, source: 'lodestar-cockpit',
  reason: 'cockpit', priority: 0, protocolNetwork: 'eip155:42161', ...extra,
});

function route(url: string): unknown {
  const path = url.replace('http://cockpit.local', '');
  if (path === '/auth/session') return { indexer: INDEXER, signer: INDEXER, expiresAt: 9_999_999_999 };
  if (path.startsWith('/actions')) {
    return { actions: [action(1, 'allocate', { amount: '50000' }), action(2, 'unallocate', { allocationID: ALLOC })] };
  }
  if (path === '/rules') return { rules: [] };
  if (path.startsWith(`/api/subgraph-deployment/${HASH}`)) return fixture.deployment;
  if (path.startsWith('/api/network-stats')) return fixture.network;
  if (path.startsWith('/api/dips')) return fixture.dips;
  if (path.startsWith('/api/poi?deployment=')) return fixture.poi;
  if (path.startsWith(`/api/indexer/${INDEXER}/pnl`)) return fixture.pnl;
  if (path.startsWith(`/api/indexer/${INDEXER}`)) return fixture.indexer;
  if (path.startsWith('/api/reo')) return fixture.reo;
  return null;
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('the Cockpit queue context', () => {
  it('shows what each queued action would earn, collect and risk', async () => {
    vi.stubEnv('NEXT_PUBLIC_COCKPIT_URL', 'http://cockpit.local');
    vi.stubGlobal('fetch', vi.fn((url: string) => {
      const body = route(url);
      return Promise.resolve(new Response(JSON.stringify(body ?? { error: 'not found' }), { status: body ? 200 : 404 }));
    }));
    const { Cockpit } = await import('../Cockpit');
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <Cockpit />
      </QueryClientProvider>,
    );

    expect(await screen.findByText('est. 8.09% a year at 50.00K GRT')).toBeInTheDocument();
    expect(await screen.findByText('closing collects ~18.41 GRT')).toBeInTheDocument();
    expect(await screen.findByText('last POI (epoch 1358) agreed with consensus')).toBeInTheDocument();
    expect(screen.getAllByText('pinlink-mvp-prod')).toHaveLength(2);

    const bar = screen.getByText('REO').parentElement!.parentElement!;
    expect(await within(bar).findByText(/^eligible/)).toBeInTheDocument();
    expect(await within(bar).findByText('718.22K GRT')).toBeInTheDocument();
  });
});
