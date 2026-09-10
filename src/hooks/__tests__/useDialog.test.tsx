// @vitest-environment jsdom
/**
 * The dialog that replaced `window.confirm`, and the one way it can be worse than what it replaces.
 *
 * `confirm` always returns. A promise-based replacement does not have to, and a caller awaiting a
 * promise nobody will settle is stuck for the life of the page holding whatever it was holding. So
 * every path that removes the dialog settles it: the buttons, Escape, the backdrop and unmount.
 */
import { describe, it, expect, vi } from 'vitest';
import { renderHook, render, act, waitFor, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { useDialog } from '../useDialog';

function Harness({ onResult }: { onResult: (v: boolean) => void }) {
  const { confirm, dialog } = useDialog();
  return (
    <div>
      <button onClick={() => void confirm('Really?').then(onResult)}>ask</button>
      {dialog}
    </div>
  );
}

describe('confirm', () => {
  it('resolves true when confirmed', async () => {
    const onResult = vi.fn();
    const user = userEvent.setup();
    render(<Harness onResult={onResult} />);

    await user.click(screen.getByText('ask'));
    await user.click(screen.getByText('Confirm'));
    await waitFor(() => expect(onResult).toHaveBeenCalledWith(true));
  });

  it('resolves false when cancelled', async () => {
    const onResult = vi.fn();
    const user = userEvent.setup();
    render(<Harness onResult={onResult} />);

    await user.click(screen.getByText('ask'));
    await user.click(screen.getByText('Cancel'));
    await waitFor(() => expect(onResult).toHaveBeenCalledWith(false));
  });

  it('resolves false on Escape rather than leaving the caller waiting', async () => {
    const onResult = vi.fn();
    const user = userEvent.setup();
    render(<Harness onResult={onResult} />);

    await user.click(screen.getByText('ask'));
    await user.keyboard('{Escape}');
    await waitFor(() => expect(onResult).toHaveBeenCalledWith(false));
  });

  it('settles once, however many ways the dialog is dismissed', async () => {
    const onResult = vi.fn();
    const user = userEvent.setup();
    render(<Harness onResult={onResult} />);

    await user.click(screen.getByText('ask'));
    await user.click(screen.getByText('Confirm'));
    await waitFor(() => expect(onResult).toHaveBeenCalledTimes(1));

    await user.keyboard('{Escape}');
    expect(onResult).toHaveBeenCalledTimes(1);
  });

  it('settles false if the component unmounts while the dialog is open', async () => {
    // The case that would hang a caller for the life of the page.
    const onResult = vi.fn();
    const user = userEvent.setup();
    const { unmount } = render(<Harness onResult={onResult} />);

    await user.click(screen.getByText('ask'));
    expect(onResult).not.toHaveBeenCalled();

    unmount();
    await waitFor(() => expect(onResult).toHaveBeenCalledWith(false));
  });

  it('shows the message and the caller’s own labels', async () => {
    const user = userEvent.setup();
    function Custom() {
      const { confirm, dialog } = useDialog();
      return (
        <div>
          <button onClick={() => void confirm('The GRT returns to your wallet.', { title: 'Cancel this bounty?', confirmLabel: 'Cancel the bounty' })}>
            ask
          </button>
          {dialog}
        </div>
      );
    }
    render(<Custom />);
    await user.click(screen.getByText('ask'));

    expect(screen.getByText('Cancel this bounty?')).toBeTruthy();
    expect(screen.getByText('The GRT returns to your wallet.')).toBeTruthy();
    expect(screen.getByText('Cancel the bounty')).toBeTruthy();
  });
});

describe('notify', () => {
  it('offers only a dismissal, since there is nothing to decide', async () => {
    const user = userEvent.setup();
    function N() {
      const { notify, dialog } = useDialog();
      return (
        <div>
          <button onClick={() => void notify('the transaction reverted')}>ask</button>
          {dialog}
        </div>
      );
    }
    render(<N />);
    await user.click(screen.getByText('ask'));

    expect(screen.getByText('OK')).toBeTruthy();
    expect(screen.queryByText('Cancel')).toBeNull();
  });
});

describe('accessibility', () => {
  it('is a labelled modal dialog', async () => {
    const user = userEvent.setup();
    const { result } = renderHook(() => useDialog());
    expect(result.current.dialog).toBeNull();

    render(<Harness onResult={() => {}} />);
    await user.click(screen.getByText('ask'));

    const dialog = screen.getByRole('dialog');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.getAttribute('aria-label')).toBe('Are you sure?');
  });
});
