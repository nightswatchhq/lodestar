// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { CopyableId, truncatedQm } from '../CopyableId';

const writeText = vi.fn();

beforeEach(() => {
  writeText.mockReset().mockResolvedValue(undefined);
  Object.defineProperty(globalThis.navigator, 'clipboard', {
    value: { writeText },
    configurable: true,
    writable: true,
  });
});

describe('CopyableId', () => {
  it('copies the full value, not the truncated display', async () => {
    render(
      <CopyableId
        value="QmDeploymentHashAAAAAA"
        title="Copy hash"
        display="QmDeploy...AAAAAA"
      />,
    );
    expect(screen.getByText('QmDeploy...AAAAAA')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Copy hash' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('QmDeploymentHashAAAAAA'));
  });
});

describe('truncatedQm', () => {
  it('keeps the slice the allocations table already showed', () => {
    expect(truncatedQm('QmDeploymentHashAAAAAA')).toBe('QmDeploy...AAAAAA');
  });
});
