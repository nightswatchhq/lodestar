// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('wagmi', () => ({ useAccount: () => ({}), useSignMessage: () => ({}) }));
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams() }));

const HASH = 'QmSWxvd8SaQK6qZKJ7xtfxCCGoRzGnoi2WNzmJYYJW9BXY';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('the Cockpit query prices', () => {
  it('flags a model the gateway ignores, and needs a second press to serve for free', async () => {
    vi.stubEnv('NEXT_PUBLIC_COCKPIT_URL', 'http://cockpit.local');
    const posts: unknown[] = [];
    vi.stubGlobal('fetch', vi.fn((url: string, init?: RequestInit) => {
      const path = url.replace('http://cockpit.local', '');
      const ok = (b: unknown) => Promise.resolve(new Response(JSON.stringify(b)));
      if (init?.method === 'POST' && path === '/cost-models') {
        posts.push(JSON.parse(String(init.body)));
        return ok({ costModel: { deployment: 'global', model: 'default => 0;' } });
      }
      if (path === '/auth/session') return ok({ indexer: '0xabc', signer: '0xabc', expiresAt: 9_999_999_999 });
      if (path.startsWith('/actions')) return ok({ actions: [] });
      if (path === '/rules') return ok({ rules: [] });
      if (path === '/cost-models') {
        return ok({ costModels: [
          { deployment: 'global', model: 'default => 0.00004;' },
          { deployment: HASH, model: 'query { pairs } => 0.1;' },
        ] });
      }
      if (path.startsWith('/api/price')) return ok({ price: 0.1, change24h: 0 });
      return Promise.resolve(new Response('{}', { status: 404 }));
    }));
    const { Cockpit } = await import('../Cockpit');
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <Cockpit />
      </QueryClientProvider>,
    );

    expect(await screen.findByText('not a flat price, so the gateway reads it as zero')).toBeInTheDocument();
    expect(await screen.findByText('$4 per million queries')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('GRT per query'), { target: { value: '0' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save price' }));
    expect(await screen.findByText(/A zero price serves every query for free/)).toBeInTheDocument();
    expect(posts).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: 'Serve for nothing' }));
    await waitFor(() => expect(posts).toEqual([{ deployment: 'global', price: '0' }]));
  });
});
