'use client';

import { Badge } from '@/components/ui/Badge';
import { formatGRT, weiToGRT, formatNumber } from '@/lib/utils';
import { epochStatus, type EpochStatus } from '@/lib/network-math';
import type { Epoch } from '@/lib/queries';

const STATUS_VARIANT: Record<EpochStatus, 'success' | 'accent' | 'warning' | 'default'> = {
  Active: 'success',
  Settling: 'accent',
  Distributing: 'warning',
  Finalized: 'default',
};

// EpochManager counts L1 blocks, so its own range is the exact one; the L2 range is what an older
// backend sends, and is labelled so the two are never read as the same chain.
function blockRange(e: Epoch): string {
  if (e.startL1Block != null && e.endL1Block != null) {
    return `L1 ${formatNumber(e.startL1Block)} – ${formatNumber(e.endL1Block)}`;
  }
  return `L2 ${formatNumber(e.startBlock)} – ${formatNumber(e.endBlock)}`;
}

/**
 * Per-epoch table with derived status (Active/Settling/Distributing/Finalized)
 * and query-fee / reward totals. Status is derived from the epoch number vs the
 * current epoch — the network subgraph has no on-chain status field.
 */
export function EpochTable({ epochs, currentEpoch }: { epochs: Epoch[]; currentEpoch: number }) {
  if (epochs.length === 0) {
    return <p className="text-sm text-[var(--text-muted)] py-2">No epoch data available.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b border-[var(--border)]">
            <th className="px-4 py-2 text-left text-[11px] font-medium text-[var(--text-muted)]">Epoch</th>
            <th className="px-4 py-2 text-left text-[11px] font-medium text-[var(--text-muted)]">Status</th>
            <th className="px-4 py-2 text-right text-[11px] font-medium text-[var(--text-muted)]">Query Fees</th>
            <th className="px-4 py-2 text-right text-[11px] font-medium text-[var(--text-muted)]">Indexing Rewards</th>
            <th className="px-4 py-2 text-right text-[11px] font-medium text-[var(--text-muted)] hidden sm:table-cell">Block Range</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--border)]">
          {epochs.map((e) => {
            const status = epochStatus(Number(e.id), currentEpoch);
            return (
              <tr key={e.id} className="hover:bg-[var(--bg-elevated)]">
                <td className="px-4 py-3 font-mono text-sm text-[var(--text)]">{e.id}</td>
                <td className="px-4 py-3"><Badge variant={STATUS_VARIANT[status]}>{status}</Badge></td>
                <td className="px-4 py-3 text-right font-mono text-sm text-[var(--text)]">{formatGRT(weiToGRT(e.totalQueryFees))} GRT</td>
                <td className="px-4 py-3 text-right font-mono text-sm text-[var(--green)]">{formatGRT(weiToGRT(e.totalRewards))} GRT</td>
                <td className="px-4 py-3 text-right font-mono text-[11px] text-[var(--text-faint)] hidden sm:table-cell">
                  {blockRange(e)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
