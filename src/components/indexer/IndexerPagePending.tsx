'use client';

import { IndexerCompactHeader } from '@/components/indexer/IndexerCompactHeader';
import { IndexerTabBar } from '@/components/indexer/IndexerTabBar';
import { shortenAddress, weiToGRT } from '@/lib/utils';
import type { EnrichedIndexer } from '@/lib/enriched';

export function IndexerPagePending({
  address,
  enriched,
  ensName,
}: {
  address: string;
  enriched: EnrichedIndexer | undefined;
  ensName: string | null;
}) {
  if (!enriched) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="w-8 h-8 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const name = ensName || enriched.ensName || enriched.name || shortenAddress(address);
  const allocated = weiToGRT(enriched.allocatedTokens);
  const pool = enriched.selfStakeGRT + enriched.delegatedGRT;

  return (
    <div className="space-y-6">
      <IndexerCompactHeader
        name={name}
        address={address}
        reoStatus={{ status: enriched.reoStatus, daysRemaining: enriched.reoDaysRemaining }}
        availableGRT={null}
        provisionedGRT={enriched.provisionedGRT}
        allocatedGRT={allocated}
        delegatedGRT={enriched.delegatedGRT}
        allocationRatio={pool > 0 ? allocated / pool : null}
        statedCutPPM={enriched.indexingRewardCut}
        effectiveCutPercent={enriched.effectiveCut}
        rollingAPY30d={enriched.rollingAPY30d}
      />
      <IndexerTabBar active="overview" onSelect={() => undefined} />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4" aria-hidden>
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 rounded-[var(--radius-card)] bg-[var(--bg-elevated)] animate-pulse" />
        ))}
      </div>
      <div className="h-64 rounded-[var(--radius-card)] bg-[var(--bg-elevated)] animate-pulse" aria-hidden />
    </div>
  );
}
