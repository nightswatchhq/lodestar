// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('wagmi', () => ({ useAccount: () => ({}), useSignMessage: () => ({}) }));
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams() }));

const HASH = 'QmSWxvd8SaQK6qZKJ7xtfxCCGoRzGnoi2WNzmJYYJW9BXY';
const RULE = {
  identifier: HASH, identifierType: 'deployment', decisionBasis: 'always', allocationAmount: '5000000000000000000000',
  parallelAllocations: 1, minSignal: null, minStake: null, minAverageQueryFees: null, maxAllocationPercentage: null,
  protocolNetwork: 'eip155:42161',
};

function answer(body: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(body), { status }));
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('the Cockpit indexing rules', () => {
  it('lists the agent\'s rules and saves an edit as the Cockpit takes it', async () => {
    vi.stubEnv('NEXT_PUBLIC_COCKPIT_URL', 'http://cockpit.local');
    const posts: { path: string; body: unknown }[] = [];
    vi.stubGlobal('fetch', vi.fn((url: string, init?: RequestInit) => {
      const path = url.replace('http://cockpit.local', '');
      if (init?.method === 'POST') {
        posts.push({ path, body: JSON.parse(String(init.body)) });
        return answer({ rule: { ...RULE, allocationAmount: '8000000000000000000000' } });
      }
      if (path === '/auth/session') return answer({ indexer: '0xabc', signer: '0xabc', expiresAt: 9_999_999_999 });
      if (path.startsWith('/actions')) return answer({ actions: [] });
      if (path === '/rules') return answer({ rules: [RULE] });
      return answer({ error: 'not found' }, 404);
    }));
    const { Cockpit } = await import('../Cockpit');
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <Cockpit />
      </QueryClientProvider>,
    );

    expect(await screen.findByText('5,000')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    const amount = screen.getByLabelText('Allocation amount (GRT)');
    expect(amount).toHaveValue('5000');
    fireEvent.change(amount, { target: { value: '8000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save rule' }));

    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0]).toEqual({
      path: '/rules',
      body: { identifier: HASH, decisionBasis: 'always', allocationAmount: '8000', parallelAllocations: 1 },
    });
    expect(await screen.findByText('Saved.')).toBeInTheDocument();
  });

  it('refuses a malformed rule without sending it', async () => {
    vi.stubEnv('NEXT_PUBLIC_COCKPIT_URL', 'http://cockpit.local');
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      const path = url.replace('http://cockpit.local', '');
      if (init?.method === 'POST') return answer({});
      if (path === '/auth/session') return answer({ indexer: '0xabc', signer: '0xabc', expiresAt: 9_999_999_999 });
      if (path.startsWith('/actions')) return answer({ actions: [] });
      return answer({ rules: [] });
    });
    vi.stubGlobal('fetch', fetchMock);
    const { Cockpit } = await import('../Cockpit');
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <Cockpit />
      </QueryClientProvider>,
    );
    expect(await screen.findByText('The agent has no rules.')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Minimum signal (GRT)'), { target: { value: '1e3' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save rule' }));
    expect(await screen.findByText('Minimum signal must be an amount in GRT')).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(false);
  });
});
