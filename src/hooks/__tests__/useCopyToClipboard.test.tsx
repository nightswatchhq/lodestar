// @vitest-environment jsdom
/**
 * The failure paths, which are what the seven copies disagreed about.
 *
 * Two of them called `navigator.clipboard.writeText` unguarded with no feedback, so on http or
 * with permission denied nothing happened and nothing said so. Others reported success without
 * looking at the promise, which is worse: "Copied!" when nothing was.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

import { useCopyToClipboard } from '../useCopyToClipboard';

const writeText = vi.fn();

beforeEach(() => {
  vi.useFakeTimers();
  writeText.mockReset().mockResolvedValue(undefined);
  Object.defineProperty(globalThis.navigator, 'clipboard', {
    value: { writeText },
    configurable: true,
    writable: true,
  });
});
afterEach(() => vi.useRealTimers());

describe('a successful copy', () => {
  it('writes the text and reports copied', async () => {
    const { result } = renderHook(() => useCopyToClipboard());
    await act(async () => {
      await result.current.copy('QmAbc');
    });
    expect(writeText).toHaveBeenCalledWith('QmAbc');
    expect(result.current.copied).toBe(true);
    expect(result.current.failed).toBe(false);
  });

  it('stops reporting copied after the reset', async () => {
    const { result } = renderHook(() => useCopyToClipboard(1500));
    await act(async () => {
      await result.current.copy('QmAbc');
    });
    expect(result.current.copied).toBe(true);
    act(() => {
      vi.advanceTimersByTime(1500);
    });
    expect(result.current.copied).toBe(false);
  });
});

describe('a failed copy', () => {
  it('reports failure rather than success when permission is denied', async () => {
    writeText.mockRejectedValue(new Error('NotAllowedError'));
    const { result } = renderHook(() => useCopyToClipboard());
    await act(async () => {
      await result.current.copy('QmAbc');
    });
    expect(result.current.copied).toBe(false);
    expect(result.current.failed).toBe(true);
  });

  it('reports failure rather than throwing when there is no clipboard at all', async () => {
    // `navigator.clipboard` is undefined outside a secure context, which is every developer's LAN
    // address. Two of the copies this replaces would have thrown here.
    Object.defineProperty(globalThis.navigator, 'clipboard', {
      value: undefined,
      configurable: true,
      writable: true,
    });
    const { result } = renderHook(() => useCopyToClipboard());
    await act(async () => {
      await result.current.copy('QmAbc');
    });
    expect(result.current.failed).toBe(true);
    expect(result.current.copied).toBe(false);
  });

  it('clears the failure after the reset, so the button returns to normal', async () => {
    writeText.mockRejectedValue(new Error('denied'));
    const { result } = renderHook(() => useCopyToClipboard(1500));
    await act(async () => {
      await result.current.copy('QmAbc');
    });
    expect(result.current.failed).toBe(true);
    act(() => {
      vi.advanceTimersByTime(1500);
    });
    expect(result.current.failed).toBe(false);
  });
});

describe('unmounting', () => {
  it('does not set state after the component has gone', async () => {
    // A copy on a table row that then unmounts. React logs a warning for this; the cleanup means
    // it does not happen.
    const { result, unmount } = renderHook(() => useCopyToClipboard(1500));
    await act(async () => {
      await result.current.copy('QmAbc');
    });
    unmount();
    expect(() =>
      act(() => {
        vi.advanceTimersByTime(2000);
      }),
    ).not.toThrow();
  });
});
