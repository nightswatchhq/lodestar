// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

describe('/cockpit on a build without a Cockpit', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('explains how to self-host and makes no request to anything', async () => {
    vi.stubEnv('NEXT_PUBLIC_COCKPIT_URL', '');
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { default: CockpitPage } = await import('../page');
    render(<CockpitPage />);
    expect(screen.getByText('Self-hosting it')).toBeInTheDocument();
    expect(screen.getByText(/never talks to an indexer agent/)).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
