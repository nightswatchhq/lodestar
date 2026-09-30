// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ComplexityBadge, COMPLEXITY_ESTIMATE_TIP, syncTimeText } from '../ComplexityBadge';

// lodestar#319: "Light" subgraphs that sync slowly. The label is a manifest score, and it has to
// say so wherever it appears, or it reads as a measurement.
describe('ComplexityBadge', () => {
  it('marks the label as an estimate, visibly and for screen readers', () => {
    render(<ComplexityBadge complexity="Light" />);
    const badge = screen.getByTitle(COMPLEXITY_ESTIMATE_TIP);
    expect(badge.textContent).toBe('Light* (estimate)');
    expect(screen.getByText('(estimate)', { exact: false }).className).toContain('sr-only');
  });

  it('says what the estimate leaves out', () => {
    expect(COMPLEXITY_ESTIMATE_TIP).toMatch(/not measured sync speed/);
    expect(COMPLEXITY_ESTIMATE_TIP).toMatch(/eth_calls/);
  });

  it('renders a gap, not an estimate, when the manifest has not been read', () => {
    const { container } = render(<ComplexityBadge complexity={null} />);
    expect(container.textContent).toBe('--');
    expect(screen.queryByTitle(COMPLEXITY_ESTIMATE_TIP)).toBeNull();
  });

  // Uniswap V2 on Ethereum, 2026-09-30: Light by its manifest, about 48 days by its indexers.
  const v2 = { blocksPerHour: 12_000, chainBlocksPerHour: 300, indexers: 7, measuredAt: 1_790_000_000, daysToSync: 48.1 };

  it('shows a measured label without the asterisk, and the measurement on hover', () => {
    render(<ComplexityBadge complexity="Light" difficulty="Extreme" difficultySource="measured" syncSpeed={v2} />);
    const badge = screen.getByTitle(/Measured: 7 indexers syncing at 12,000 blocks\/h/);
    expect(badge.textContent).toBe('Extreme (measured)');
    expect(badge.getAttribute('title')).toContain('about 48 days');
  });

  it('falls back to the estimate where nothing was measured', () => {
    render(<ComplexityBadge complexity="Light" difficulty="Light" difficultySource="manifest" syncSpeed={null} />);
    expect(screen.getByTitle(COMPLEXITY_ESTIMATE_TIP).textContent).toBe('Light* (estimate)');
  });

  it('says when a sync never catches up, and counts hours under a day', () => {
    expect(syncTimeText({ ...v2, daysToSync: null })).toBe('never catches up at this speed');
    expect(syncTimeText({ ...v2, daysToSync: 0.25 })).toBe('about 6 hours');
    // uniswap-v4-base-3, 2026-09-30: 24 of 26 indexers syncing at about the chain's own pace.
    expect(syncTimeText({ ...v2, daysToSync: 8953.2 })).toBe('over a year');
  });
});
