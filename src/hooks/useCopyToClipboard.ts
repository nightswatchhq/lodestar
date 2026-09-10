'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Copy text, and know whether it worked.
 *
 * Seven files had their own version of this and no two agreed. Two of them,
 * `poi/[deployment]` and `subgraphs/[hash]`, called `navigator.clipboard.writeText` unguarded with
 * no feedback at all: the property is undefined outside a secure context and the promise rejects
 * when permission is denied, so on those two a failed copy threw into the void and the user saw
 * nothing happen and had no idea why. Others guarded with `?.` but ignored the rejection and
 * reported success regardless, which is worse: it says copied when nothing was.
 *
 * This is a hook rather than a component on purpose. What those seven share is the behaviour; what
 * they do not share is the appearance, which ranges from an icon inside a truncated row to a text
 * button under a code block. Forcing all of it through one component's props is how a shared
 * component turns into configuration soup, so the markup stays where it is and only the part that
 * was wrong is centralised. `CopyButton` exists for the two sites that genuinely are identical.
 */
export function useCopyToClipboard(resetAfterMs = 1500) {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // A copy on a row that unmounts before the reset fires would otherwise set state on a dead
  // component; the timeout is cleared rather than left running.
  useEffect(() => () => clearTimeout(timer.current), []);

  const copy = useCallback(
    async (text: string) => {
      clearTimeout(timer.current);
      try {
        // Optional chaining is load-bearing: `navigator.clipboard` is undefined on http, which is
        // every developer's LAN address and the iOS shell before it gets a certificate.
        if (!navigator.clipboard) throw new Error('clipboard unavailable');
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setFailed(false);
      } catch {
        setCopied(false);
        setFailed(true);
      }
      timer.current = setTimeout(() => {
        setCopied(false);
        setFailed(false);
      }, resetAfterMs);
    },
    [resetAfterMs],
  );

  return { copy, copied, failed };
}
