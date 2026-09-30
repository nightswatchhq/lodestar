// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ComplexityBadge, COMPLEXITY_ESTIMATE_TIP } from '../ComplexityBadge';

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
});
