'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useWaitForTransactionReceipt, useWriteContract } from 'wagmi';

/**
 * One on-chain transaction, from wallet prompt to mined receipt.
 *
 * The same eleven lines were written out at every call site: `useWriteContract` for the prompt,
 * `useWaitForTransactionReceipt` for the wait, and a `useEffect` watching `isSuccess` to move some
 * local state on. Each of those effects carried its own `eslint-disable` for setting state in an
 * effect, which is the smell that the pattern wanted extracting rather than suppressing at every
 * call site. Awaiting `onMined` removes the need for the suppression entirely: the state update
 * happens after the await and so is no longer inside the effect body.
 *
 * Two things this fixes that the copies did not.
 *
 * `onMined` fires **once per transaction**. The copied effects were keyed on a boolean, and a
 * boolean that is already true stays true: any re-render that changed the effect's other
 * dependencies ran the body again, and React's development double-invoke ran it twice on the
 * first go. Bookkeeping that POSTs to an API is not something to do twice because a parent
 * re-rendered. The receipt is recorded against the hash it belongs to, and a hash is only handled
 * once.
 *
 * A failure is a state rather than a silence. The copies watched `isSuccess` and nothing else, so
 * a rejected signature or a reverted transaction left the UI sitting on "confirming" for ever.
 *
 * Types are derived from wagmi's own hooks rather than imported from `viem`. There are two copies
 * of viem 2.55.11 in the tree, differing only by their `zod` peer, so `TransactionReceipt`
 * imported directly is a different type from the one wagmi hands back and the two do not unify.
 */

/**
 * A mined receipt, declared structurally rather than imported.
 *
 * `NonNullable<ReturnType<typeof useWaitForTransactionReceipt>['data']>` looks like the right way
 * to say this and is not: without type arguments the generic defaults collapse it to `{}`, so
 * `receipt.logs` does not typecheck at the call sites. Importing `TransactionReceipt` from `viem`
 * fails differently, per the note above. This lists what callers actually read, and the one cast
 * that bridges it lives in this file rather than at every use.
 */
export interface MinedReceipt {
  transactionHash: `0x${string}`;
  status: 'success' | 'reverted';
  logs: readonly { address: string; topics: readonly string[]; data: string }[];
}

/** Where a transaction is, from the user's point of view rather than wagmi's. */
export type ContractStepStatus =
  /** Nothing sent. */
  | 'idle'
  /** Waiting for the wallet: the prompt is open, or the user has not decided. */
  | 'wallet'
  /** Signed and broadcast, waiting to be mined. */
  | 'mining'
  /** Mined, and `onMined` has run to completion. */
  | 'done'
  /** Rejected in the wallet, or reverted on chain. */
  | 'error';

/**
 * What the hook returns.
 *
 * `write` is deliberately absent from this interface and comes from the inferred return type
 * instead: annotating it would resolve `writeContract` through whichever copy of viem this file
 * happens to see, and it would not match the one the caller's wagmi config produces.
 */
interface ContractStepState {
  status: ContractStepStatus;
  txHash: `0x${string}` | undefined;
  receipt: MinedReceipt | undefined;
  error: Error | null;
  /** Back to `idle`, so a wizard can offer a retry. */
  reset: () => void;
}

export function useContractStep(opts?: {
  /**
   * Runs once, after the receipt arrives. Await anything asynchronous here: `status` stays
   * `mining` until it resolves, so a wizard does not show "done" while the bookkeeping POST that
   * records the transaction is still in flight.
   */
  onMined?: (receipt: MinedReceipt) => void | Promise<void>;
}) {
  const { writeContract, data: txHash, isPending: awaitingWallet, error: writeError, reset: resetWrite } =
    useWriteContract();

  const {
    data: rawReceipt,
    isSuccess: mined,
    error: waitError,
  } = useWaitForTransactionReceipt({ hash: txHash });

  // The one place the two viem copies are reconciled. wagmi's receipt has every field
  // `MinedReceipt` names and more; the cast asserts the overlap rather than inventing it.
  const receipt = rawReceipt as MinedReceipt | undefined;

  const [settled, setSettled] = useState(false);
  const [minedError, setMinedError] = useState<Error | null>(null);

  // The hash whose receipt has already been handled. A ref rather than state because changing it
  // must not itself cause a render, and because the guard has to be set synchronously before the
  // first await inside the effect.
  const handled = useRef<string | undefined>(undefined);
  const onMined = useRef(opts?.onMined);
  // Kept current in an effect rather than assigned during render, and declared **before** the
  // effect that reads it so React runs it first in the same commit. Call sites pass an inline
  // closure over their own state, and a stale one would do the bookkeeping with last render's
  // values.
  useEffect(() => {
    onMined.current = opts?.onMined;
  });

  useEffect(() => {
    if (!mined || !receipt || !txHash || handled.current === txHash) return;
    handled.current = txHash;

    let cancelled = false;
    void (async () => {
      try {
        await onMined.current?.(receipt);
        if (!cancelled) setSettled(true);
      } catch (e) {
        if (!cancelled) setMinedError(e instanceof Error ? e : new Error(String(e)));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [mined, receipt, txHash]);

  const reset = useCallback(() => {
    handled.current = undefined;
    setSettled(false);
    setMinedError(null);
    resetWrite();
  }, [resetWrite]);

  const error = writeError ?? waitError ?? minedError ?? null;

  // Order matters: an error outranks progress, and a transaction is not `done` until `onMined` has
  // finished rather than merely when the receipt landed.
  const status: ContractStepStatus = error
    ? 'error'
    : settled
      ? 'done'
      : txHash
        ? 'mining'
        : awaitingWallet
          ? 'wallet'
          : 'idle';

  const state: ContractStepState = { status, txHash, receipt, error, reset };
  return { ...state, write: writeContract };
}

/** The hook's return type, for anything that needs to name it. */
export type ContractStep = ReturnType<typeof useContractStep>;
