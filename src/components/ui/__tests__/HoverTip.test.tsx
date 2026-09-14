// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { HoverTip, HoverTipContent } from '../HoverTip';

function tableCellWithTip() {
  return render(
    <div data-testid="clipping-wrapper" style={{ overflowX: 'auto' }}>
      <HoverTip>
        <span>trigger</span>
        <HoverTipContent width={192}>Delegation Activity (7d)</HoverTipContent>
      </HoverTip>
    </div>,
  );
}

describe('HoverTip', () => {
  it('draws nothing until the trigger is hovered', () => {
    tableCellWithTip();
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('draws the tooltip outside the clipping wrapper, and removes it on leave', () => {
    tableCellWithTip();
    fireEvent.mouseEnter(screen.getByText('trigger'));
    const tip = screen.getByRole('tooltip');
    expect(tip).toHaveTextContent('Delegation Activity (7d)');
    expect(screen.getByTestId('clipping-wrapper').contains(tip)).toBe(false);
    expect(tip.style.position).toBe('fixed');
    fireEvent.mouseLeave(screen.getByText('trigger'));
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('closes when the page scrolls, rather than floating away from its row', () => {
    tableCellWithTip();
    fireEvent.mouseEnter(screen.getByText('trigger'));
    expect(screen.getByRole('tooltip')).toBeInTheDocument();
    fireEvent.scroll(window);
    expect(screen.queryByRole('tooltip')).toBeNull();
  });
});
