// @vitest-environment jsdom
/**
 * The two faults the copied ceremony had, and the happy path.
 *
 * Every call site wrote `useEffect(() => { if (isSuccess) ... }, [isSuccess])`. That has two
 * problems which do not show up in normal use and are expensive when they do: the body runs again
 * on any render that changes the effect's other dependencies, and a failure never arrives at all,
 * so the UI sits on "confirming" for ever. Both are asserted here.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';

const writeState: {
  data?: `0x${string}`;
  isPending: boolean;
  error: Error | null;
  writeContract: ReturnType<typeof vi.fn>;
  reset: ReturnType<typeof vi.fn>;
} = { isPending: false, error: null, writeContract: vi.fn(), reset: vi.fn() };

const waitState: { data?: unknown; isSuccess: boolean; error: Error | null } = {
  isSuccess: false,
  error: null,
};

vi.mock('wagmi', () => ({
  useWriteContract: () => writeState,
  useWaitForTransactionReceipt: () => waitState,
}));

import { useContractStep } from '../useContractStep';

const RECEIPT = { transactionHash: '0xabc', status: 'success' };

beforeEach(() => {
  writeState.data = undefined;
  writeState.isPending = false;
  writeState.error = null;
  writeState.writeContract = vi.fn();
  writeState.reset = vi.fn();
  waitState.data = undefined;
  waitState.isSuccess = false;
  waitState.error = null;
});

describe('status', () => {
  it('is idle before anything is sent', () => {
    const { result } = renderHook(() => useContractStep());
    expect(result.current.status).toBe('idle');
  });

  it('is wallet while the prompt is open', () => {
    writeState.isPending = true;
    const { result } = renderHook(() => useContractStep());
    expect(result.current.status).toBe('wallet');
  });

  it('is mining once there is a hash and no receipt', () => {
    writeState.data = '0xabc';
    const { result } = renderHook(() => useContractStep());
    expect(result.current.status).toBe('mining');
  });

  it('stays mining until onMined has finished, not merely until the receipt lands', async () => {
    // A wizard that shows "done" while the POST recording the transaction is still in flight is
    // telling the user something that is not yet true.
    let release: () => void = () => {};
    const slow = new Promise<void>((r) => {
      release = r;
    });
    writeState.data = '0xabc';
    waitState.data = RECEIPT;
    waitState.isSuccess = true;

    const { result } = renderHook(() => useContractStep({ onMined: () => slow }));
    await waitFor(() => expect(result.current.status).toBe('mining'));

    await act(async () => {
      release();
      await slow;
    });
    await waitFor(() => expect(result.current.status).toBe('done'));
  });
});

describe('onMined', () => {
  it('runs once per transaction, however many times the component re-renders', async () => {
    // The copied effects were keyed on a boolean. A boolean that is already true stays true, so
    // any re-render that touched the effect's other dependencies ran the bookkeeping again.
    const onMined = vi.fn();
    writeState.data = '0xabc';
    waitState.data = RECEIPT;
    waitState.isSuccess = true;

    const { result, rerender } = renderHook(() => useContractStep({ onMined }));
    await waitFor(() => expect(result.current.status).toBe('done'));

    rerender();
    rerender();
    rerender();
    await waitFor(() => expect(onMined).toHaveBeenCalledTimes(1));
  });

  it('runs again for a second transaction after a reset', async () => {
    const onMined = vi.fn();
    writeState.data = '0xabc';
    waitState.data = RECEIPT;
    waitState.isSuccess = true;

    const { result, rerender } = renderHook(() => useContractStep({ onMined }));
    await waitFor(() => expect(onMined).toHaveBeenCalledTimes(1));

    act(() => result.current.reset());
    writeState.data = '0xdef';
    rerender();

    await waitFor(() => expect(onMined).toHaveBeenCalledTimes(2));
  });

  it('receives the receipt', async () => {
    const onMined = vi.fn();
    writeState.data = '0xabc';
    waitState.data = RECEIPT;
    waitState.isSuccess = true;

    renderHook(() => useContractStep({ onMined }));
    await waitFor(() => expect(onMined).toHaveBeenCalledWith(RECEIPT));
  });
});

describe('failure', () => {
  it('surfaces a rejected signature rather than sitting on wallet for ever', () => {
    writeState.error = new Error('User rejected the request');
    const { result } = renderHook(() => useContractStep());
    expect(result.current.status).toBe('error');
    expect(result.current.error?.message).toContain('rejected');
  });

  it('surfaces a reverted transaction rather than sitting on mining for ever', () => {
    writeState.data = '0xabc';
    waitState.error = new Error('reverted');
    const { result } = renderHook(() => useContractStep());
    expect(result.current.status).toBe('error');
  });

  it('surfaces a throw from onMined, so failed bookkeeping is not silent', async () => {
    // The transaction succeeded and the record of it did not. Showing "done" would be a lie the
    // user cannot act on.
    writeState.data = '0xabc';
    waitState.data = RECEIPT;
    waitState.isSuccess = true;

    const { result } = renderHook(() =>
      useContractStep({
        onMined: () => {
          throw new Error('recording the bounty failed');
        },
      }),
    );
    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.error?.message).toContain('recording the bounty failed');
  });

  it('clears the error on reset, so a wizard can offer a retry', () => {
    writeState.error = new Error('User rejected the request');
    const { result, rerender } = renderHook(() => useContractStep());
    expect(result.current.status).toBe('error');

    act(() => result.current.reset());
    writeState.error = null;
    rerender();
    expect(result.current.status).toBe('idle');
    expect(writeState.reset).toHaveBeenCalled();
  });
});
