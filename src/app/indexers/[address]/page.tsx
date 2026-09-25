'use client';

import { use, useState, Suspense } from 'react';
import Link from 'next/link';
import { redirect, useRouter, useSearchParams } from 'next/navigation';
import { useAccount } from 'wagmi';
import { useGRTPrice, useNetworkStats, useIndexerProvisions, useREOStatus, useIndexerDetail, useRecentDelegations, useENSName, useEnrichedIndexers, useIndexerStatus, useIndexerPayments, useAnnualIndexingIssuance } from '@/hooks/useNetworkStats';
import {
  weiToGRT,
  formatGRT,
  formatUSD,
  formatPPM,
  shortenAddress,
  resolveIndexerName,
  isGreedyCut,
  cn,
} from '@/lib/utils';
import { AllocationsPanel } from '@/components/indexer/AllocationsPanel';
import { ExportButton } from '@/components/ui/ExportButton';
import { fetchIndexerDelegators } from '@/lib/api';
import { DisputesSection } from '@/components/indexer/DisputesSection';
import { ReoCoverage } from '@/components/indexer/ReoCoverage';
import { FoghornScorecard } from '@/components/foghorn/FoghornScorecard';
import { FoghornAlertBanner } from '@/components/foghorn/FoghornAlertBanner';
import { useIndexerAllocationsQos } from '@/hooks/useFoghorn';
import { calculateDelegationCapacity } from '@/lib/rewards';
import { reoStatusOrUnknown, reoSourceOrHeuristic } from '@/lib/contracts/indexer-signals';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { StatCard, StatGrid } from '@/components/ui/StatCard';
import { ProgressBar } from '@/components/ui/ProgressBar';

import { DelegationCalculator } from '@/components/ui/DelegationCalculator';
import { ProvisionsPanel } from '@/components/ui/ProvisionsPanel';
import { isUnavailable, useQueryState } from '@/hooks/useQueryState';
import { DelegationFeed } from '@/components/feed/DelegationFeed';
import { AprProvenancePanel } from '@/components/indexer/AprProvenancePanel';
import dynamic from 'next/dynamic';

const IndexerTrendsChart = dynamic(() => import('@/components/charts/IndexerTrendsChart').then(m => ({ default: m.IndexerTrendsChart })), { ssr: false });
const StakeHistoryChart = dynamic(() => import('@/components/charts/StakeHistoryChart').then(m => ({ default: m.StakeHistoryChart })), { ssr: false });
const IndexerQoSChart = dynamic(() => import('@/components/charts/IndexerQoSChart').then(m => ({ default: m.IndexerQoSChart })), { ssr: false });
const QosQualityPanel = dynamic(() => import('@/components/indexer/QosQualityPanel').then(m => ({ default: m.QosQualityPanel })), { ssr: false });
const PnlPanel = dynamic(() => import('@/components/indexer/PnlPanel').then(m => ({ default: m.PnlPanel })), { ssr: false });
import { ParameterHistory } from '@/components/ParameterHistory';
import { calculateIndexerScore, SCORE_WEIGHTS, SCORE_LABELS, type IndexerScore } from '@/lib/risk-score';
import { SourceUnavailable } from '@/components/ui/SourceUnavailable';
import { MissingSection } from '@/components/indexer/MissingSection';
import { whyMissing } from '@/lib/contracts/indexer-detail';
import { nodeState } from '@/lib/contracts/indexer-node';
import { parseIndexerTab, type IndexerTab } from '@/lib/indexer-tabs';
import { IndexerTabBar } from '@/components/indexer/IndexerTabBar';
import { DelegatorsTable } from '@/components/indexer/DelegatorsTable';
import { DELEGATOR_EXPORT_CAP, collectDelegators, delegatorsCsv, delegatorsTabLabel } from '@/lib/indexer-delegators';
import { IndexerCompactHeader } from '@/components/indexer/IndexerCompactHeader';
import { IndexerPagePending } from '@/components/indexer/IndexerPagePending';
import { SUBGRAPH_SERVICE_ID, subgraphServiceStake } from '@/lib/subgraph-service-stake';
import { accruedTotal } from '@/lib/pending-rewards';

export default function IndexerDetailPage({
  params,
}: {
  params: Promise<{ address: string }>;
}) {
  const { address } = use(params);
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center py-24">
        <div className="w-8 h-8 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <IndexerDetailInner address={address} />
    </Suspense>
  );
}

function IndexerDetailInner({ address }: { address: string }) {
  // Mount-stable "now" (seconds) — keeps render pure (no Date.now() during render).
  const [nowSec] = useState(() => Math.floor(Date.now() / 1000));

  if (address.toLowerCase() === '0xb43b2cccceada5292732a8c58ae134adefce09bb') {
    redirect('/indexers');
  }

  const { data: indexer, isPending, fetchStatus, error } = useIndexerDetail(address);
  const { data: priceData } = useGRTPrice();
  const { data: networkData } = useNetworkStats();
  const provisions = useQueryState(useIndexerProvisions(address));
  const provisionsData = provisions.kind === 'ready' ? provisions.data : undefined;
  const { data: reoData } = useREOStatus(address);
  const { data: foghornAllocQos } = useIndexerAllocationsQos(address);
  const { data: recentDelegations } = useRecentDelegations(address);
  const { data: ensData } = useENSName(address);
  const { data: enrichedData } = useEnrichedIndexers();
  const { data: statusData, isLoading: statusLoading } = useIndexerStatus(address);
  const { data: paymentsData } = useIndexerPayments(address);
  const annualIssuance = useAnnualIndexingIssuance();
  const { address: connected } = useAccount();
  const router = useRouter();
  const searchParams = useSearchParams();

  // Pull pre-computed fields from enriched cache (rolling APY, score)
  const enrichedIndexer = enrichedData?.indexers?.find(
    (e) => e.id.toLowerCase() === address.toLowerCase()
  );

  const grtPrice = priceData?.price ?? 0;
  const network = networkData?.graphNetwork;
  const delegationRatio = network?.delegationRatio ?? 16;

  const totalNetworkSignal = network?.totalTokensSignalled ? weiToGRT(network.totalTokensSignalled) : 0;

  // `isPending` rather than `isLoading`, and the difference is the whole bug. React-query pauses
  // retries when it believes the connection is gone, and a paused query is not fetching: with
  // `isLoading` the guard fell straight through to "not found" and stayed there, with no spinner
  // and no error, telling somebody a real indexer did not exist because we could not reach our own
  // backend. Observed on 2026-09-10: status pending, fetchStatus paused, failureCount 1, for ever.
  if (isPending && fetchStatus === 'paused') {
    return (
      <div className="py-12">
        <SourceUnavailable
          what={`Indexer ${shortenAddress(address)}`}
          detail="The connection appears to be down, so this could not be looked up."
        />
      </div>
    );
  }

  if (isPending) {
    return (
      <IndexerPagePending
        address={address}
        enriched={enrichedIndexer}
        ensName={ensData?.ensName ?? null}
      />
    );
  }

  // A failed request and an address nobody has staked from are different answers, and this used to
  // give the second for both. Telling somebody their indexer does not exist because a nest was
  // briefly unreachable is a claim about the network made out of our own outage.
  if (error) {
    return (
      <div className="py-12">
        <SourceUnavailable
          what={`Indexer ${shortenAddress(address)}`}
          detail={error instanceof Error ? error.message : undefined}
        />
        <div className="text-center">
          <Link
            href="/indexers"
            className="mt-6 inline-flex items-center gap-2 text-sm text-[var(--accent-text)] hover:underline"
          >
            Back to Directory
          </Link>
        </div>
      </div>
    );
  }

  if (!indexer) {
    return (
      <div className="text-center py-24">
        <h2 className="text-xl font-semibold text-[var(--text)] mb-2">Indexer Not Found</h2>
        <p className="text-[var(--text-muted)]">
          Could not find indexer with address {shortenAddress(address)}
        </p>
        <Link
          href="/indexers"
          className={cn(
            'inline-flex items-center gap-2 mt-6 px-4 py-2 text-sm font-medium',
            'rounded-[var(--radius-button)] border border-[var(--border)]',
            'hover:border-[var(--accent-hover)] transition-colors'
          )}
        >
          Back to Directory
        </Link>
      </div>
    );
  }

  const name = ensData?.ensName || resolveIndexerName(indexer.account, indexer.id);
  // Absent is not empty. kittiwake#153 leaves a section its nest refused out of the answer and
  // names it under `degraded`, so `undefined` here means the read failed and `[]` means none.
  const { allocations, closedAllocations } = indexer;
  const operators = indexer.account.operators;
  const activeTab = parseIndexerTab(searchParams.get('tab'), {
    connected,
    indexerId: indexer.id,
    operatorIds: operators?.map((op) => op.id),
  });
  const impliedTab = parseIndexerTab(null, {
    connected,
    indexerId: indexer.id,
    operatorIds: operators?.map((op) => op.id),
  });
  const setTab = (tab: IndexerTab) => {
    const params = new URLSearchParams(searchParams.toString());
    if (tab === impliedTab) params.delete('tab');
    else params.set('tab', tab);
    const qs = params.toString();
    router.replace(qs ? `?${qs}` : '?', { scroll: false });
  };
  // A first probe still running is not an unreachable node (lodestar#238): kittiwake keeps the
  // per-deployment statuses at `unreachable` until it has an answer, so the node block decides.
  const node = nodeState(statusData?.node);
  const selfStake = weiToGRT(indexer.stakedTokens) - weiToGRT(indexer.lockedTokens ?? '0');
  const delegated = weiToGRT(indexer.delegatedTokens) - weiToGRT(indexer.delegatedThawingTokens ?? '0');
  const allocated = weiToGRT(indexer.allocatedTokens);
  const totalRewards = weiToGRT(indexer.rewardsEarned);
  const capacity = calculateDelegationCapacity(selfStake, delegated, delegationRatio);

  // Combine Subgraph data with other data service provisions (Dispatch, etc.)
  const nonSubgraphProvisions = (provisionsData?.provisions ?? []).filter(
    p => p.dataService.id.toLowerCase() !== SUBGRAPH_SERVICE_ID
  );
  const ssStake = provisions.kind === 'ready'
    ? subgraphServiceStake(provisions.data.provisions, delegated)
    : null;
  const stakeKnown = provisions.kind === 'ready';
  const effectiveCutPercent = (() => {
    const v = indexer.indexingRewardEffectiveCut ? parseFloat(indexer.indexingRewardEffectiveCut) : null;
    return v !== null && v >= 0 && v <= 1 ? v * 100 : null;
  })();
  const extraAllocated = nonSubgraphProvisions.reduce((sum, p) => sum + weiToGRT(p.tokensAllocated), 0);
  const extraAllocationCount = nonSubgraphProvisions.reduce((sum, p) => sum + p.allocationCount, 0);
  const tapCollected = paymentsData?.totalCollected ? weiToGRT(paymentsData.totalCollected) : 0;
  const extraRewards = nonSubgraphProvisions.reduce(
    (sum, p) => sum + weiToGRT(p.rewardsEarned ?? '0') + weiToGRT(p.queryFeesCollected ?? '0'),
    0
  ) + tapCollected;
  const hasMultipleServices = nonSubgraphProvisions.length > 0;
  const totalAllocated = allocated + extraAllocated;
  const totalAllocationCount = indexer.allocationCount + extraAllocationCount;
  const totalRewardsCombined = totalRewards + extraRewards;

  // Compute risk score from available data
  const provisionedGRT = indexer.provisionedTokens ? weiToGRT(indexer.provisionedTokens) : null;
  const distinctDataServices = new Set(
    (provisionsData?.provisions ?? []).map((p) => p.dataService.id.toLowerCase())
  ).size;
  const netFlowGRT = recentDelegations?.reduce((sum, e) => {
    const tokens = weiToGRT(e.tokens);
    if (e.eventType === 'delegation') return sum + tokens;
    if (e.eventType === 'undelegation') return sum - tokens;
    return sum; // ignore withdrawals — already counted at undelegation time
  }, 0) ?? 0;

  const indexerScore: IndexerScore | null = reoData?.status ? calculateIndexerScore({
    reoStatus: reoStatusOrUnknown(reoData.status.status),
    reoDaysRemaining: reoData.status.daysRemaining ?? null,
    reoSource: reoSourceOrHeuristic(reoData.status.source),
    selfStakeGRT: selfStake,
    lastDelegationParameterUpdate: indexer.lastDelegationParameterUpdate,
    delegatorParameterCooldown: indexer.delegatorParameterCooldown,
    allocationCount: indexer.allocationCount,
    allocatedTokens: indexer.allocatedTokens,
    provisionedGRT,
    delegationUtilization: capacity.utilizationPercent,
    ensName: ensData?.ensName ?? null,
    url: indexer.url,
    name,
    id: indexer.id,
    rewardCutPPM: indexer.indexingRewardCut,
    queryFeeCutPPM: indexer.queryFeeCut,
    effectiveCutPercent,
    queryFeesCollectedGRT: weiToGRT(indexer.queryFeesCollected ?? '0'),
    netFlowGRT,
    delegatedGRT: delegated,
    rollingAPY30d: enrichedIndexer?.rollingAPY30d ?? null,
    delegatorAPR: enrichedIndexer?.delegatorAPR ?? 0,
    distinctDataServices,
  }) : null;

  return (
    <div className="space-y-6">
      <IndexerCompactHeader
        name={name}
        address={indexer.id}
        reoStatus={reoData?.status ? {
          status: reoData.status.status,
          daysRemaining: reoData.status.daysRemaining,
        } : null}
        availableGRT={stakeKnown ? (ssStake?.available ?? 0) : null}
        provisionedGRT={stakeKnown ? (ssStake?.provisioned ?? 0) : null}
        allocatedGRT={stakeKnown ? (ssStake?.allocated ?? 0) : null}
        delegatedGRT={delegated}
        allocationRatio={stakeKnown ? (ssStake?.allocationRatio ?? null) : null}
        statedCutPPM={indexer.indexingRewardCut}
        effectiveCutPercent={effectiveCutPercent}
        rollingAPY30d={enrichedIndexer?.rollingAPY30d ?? null}
        accrued={accruedTotal(allocations)}
        accruedAt={indexer.pendingRewardsAt ?? null}
      />

      {operators == null ? (
        <p className="text-[11px] text-[var(--red-text)]">
          The operator list could not be loaded, so none is shown. {whyMissing(indexer, 'operators')}
        </p>
      ) : operators.length > 0 ? (
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[11px] text-[var(--text-faint)]">
            Operator{operators.length > 1 ? 's' : ''}:
          </span>
          {operators.map((op) => (
            <a
              key={op.id}
              href={`https://arbiscan.io/address/${op.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[11px] font-mono text-[var(--text-muted)] hover:text-[var(--accent-text)] transition-colors"
              title={op.id}
            >
              {shortenAddress(op.id)}
            </a>
          ))}
        </div>
      ) : null}

      {isGreedyCut(indexer.indexingRewardCut) && (
        <div className="flex items-start gap-3 p-4 rounded-lg border bg-[var(--red-dim)] border-[var(--red)]">
          <svg className="w-5 h-5 flex-shrink-0 mt-0.5 text-[var(--red-text)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
          </svg>
          <div>
            <p className="text-sm font-medium text-[var(--red-text)]">
              This indexer takes 100% of indexing rewards
            </p>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">
              Delegating here earns 0% APR. All indexing rewards go to the indexer.
            </p>
          </div>
        </div>
      )}

      <Link
        href={`/indexers/${address}/delegate`}
        className={cn(
          'flex items-center justify-between gap-4 px-6 py-5',
          'rounded-lg border border-[var(--accent)] bg-[var(--accent-dim)]',
          'hover:bg-[var(--accent)]/20 transition-colors group'
        )}
      >
        <div className="flex items-center gap-4">
          <div className="w-11 h-11 rounded-full bg-[var(--accent)] flex items-center justify-center flex-shrink-0 group-hover:scale-105 transition-transform">
            <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
          </div>
          <div>
            <p className="text-base font-semibold text-[var(--text)]">Delegate to {name}</p>
            <p className="text-sm text-[var(--text-muted)]">
              {formatGRT(capacity.availableCapacity)} GRT capacity available · {enrichedIndexer?.delegatorAPR != null ? `${enrichedIndexer.delegatorAPR.toFixed(1)}% APR` : '—'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <svg className="w-5 h-5 text-[var(--accent-text)] group-hover:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
          </svg>
        </div>
      </Link>

      <IndexerTabBar
        active={activeTab}
        onSelect={setTab}
        labels={{ delegators: delegatorsTabLabel(indexer) }}
      />

      {activeTab === 'overview' && (
      <>
      {/* Stats */}
      <StatGrid>
        <StatCard
          label="Self-Stake"
          value={`${formatGRT(selfStake)} GRT`}
          subtitle={formatUSD(selfStake * grtPrice)}
        />
        <StatCard
          label="Total Delegated"
          value={`${formatGRT(delegated)} GRT`}
          subtitle={formatUSD(delegated * grtPrice)}
          tooltip="Active delegation only. Tokens currently in the 28-day thaw period are excluded, as they earn no rewards and would distort APR/APY figures."
        />
        <StatCard
          label="Allocated"
          tag={hasMultipleServices ? 'All Services' : 'Subgraph'}
          value={`${formatGRT(totalAllocated)} GRT`}
          subtitle={`${totalAllocationCount} allocation${totalAllocationCount !== 1 ? 's' : ''}`}
        />
        <StatCard
          label="Total Rewards Earned"
          tag={hasMultipleServices ? 'All Services' : 'Subgraph'}
          value={`${formatGRT(totalRewardsCombined)} GRT`}
          subtitle={formatUSD(totalRewardsCombined * grtPrice)}
        />
      </StatGrid>

      {/* Rolling APY from enriched data */}
      {enrichedIndexer && (enrichedIndexer.rollingAPY30d !== null || enrichedIndexer.rollingAPY90d !== null) && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          {enrichedIndexer.rollingAPY90d !== null && (
            <Card>
              <CardContent className="py-4">
                <p className="text-[10px] text-[var(--text-faint)] mb-1">APY 90d</p>
                <p className={cn(
                  'text-xl font-semibold font-mono',
                  enrichedIndexer.rollingAPY90d >= 5 ? 'text-[var(--green)]' : 'text-[var(--text)]'
                )}>
                  {enrichedIndexer.rollingAPY90d.toFixed(2)}%
                </p>
                <p className="text-[10px] text-[var(--text-faint)] mt-1">Per-share rate · immune to thawing distortion</p>
              </CardContent>
            </Card>
          )}
          {enrichedIndexer.rollingAPY30d !== null && (
            <Card>
              <CardContent className="py-4">
                <p className="text-[10px] text-[var(--text-faint)] mb-1">APY 30d</p>
                <p className={cn(
                  'text-xl font-semibold font-mono',
                  enrichedIndexer.rollingAPY30d >= 5 ? 'text-[var(--green)]' : 'text-[var(--text)]'
                )}>
                  {enrichedIndexer.rollingAPY30d.toFixed(2)}%
                </p>
                <p className="text-[10px] text-[var(--text-faint)] mt-1">Per-share rate · immune to thawing distortion</p>
              </CardContent>
            </Card>
          )}
          <Card>
            <CardContent className="py-4">
              <p className="text-[10px] text-[var(--text-faint)] mb-1">Instantaneous APR</p>
              <p className="text-xl font-semibold font-mono text-[var(--text)]">
                {enrichedIndexer.delegatorAPR.toFixed(2)}%
              </p>
              <p className="text-[10px] text-[var(--text-faint)] mt-1">Active allocations · thawing tokens excluded · capped at 100%</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* APR Provenance — decomposition + on-chain reconcile + event trail */}
      {allocations ? (
        <AprProvenancePanel
          address={address}
          delegatedTokensWei={indexer.delegatedTokens}
          delegatedThawingTokensWei={indexer.delegatedThawingTokens ?? '0'}
          allocations={allocations.map((a) => ({
            allocatedTokens: a.allocatedTokens,
            subgraphDeployment: {
              signalledTokens: a.subgraphDeployment.signalledTokens,
              stakedTokens: a.subgraphDeployment.stakedTokens,
            },
          }))}
          indexingRewardCutPPM={indexer.indexingRewardCut}
          indexingRewardEffectiveCut={indexer.indexingRewardEffectiveCut ?? null}
          ownStakeRatio={indexer.ownStakeRatio ?? null}
          totalNetworkSignal={totalNetworkSignal}
          annualIssuance={annualIssuance}
          delegatorParameterCooldown={indexer.delegatorParameterCooldown}
          lastDelegationParameterUpdate={indexer.lastDelegationParameterUpdate}
          nowSec={nowSec}
        />
      ) : (
        <MissingSection
          title="APR Provenance"
          what="The APR decomposition"
          detail={`It is a signal-weighted sum over this indexer's active allocations, which could not be read. ${whyMissing(indexer, 'allocations')}`}
        />
      )}
      </>
      )}

      {activeTab === 'delegators' && (
      <>
      <DelegatorsTable
        address={address}
        indexer={indexer}
        nowSec={nowSec}
        actions={
          <ExportButton
            compact
            label={(indexer.delegatorCount ?? 0) > DELEGATOR_EXPORT_CAP ? `Export top ${DELEGATOR_EXPORT_CAP.toLocaleString()}` : 'Export CSV'}
            filename={`delegators-${address.toLowerCase()}`}
            onExport={async () => delegatorsCsv(await collectDelegators((first, skip) => fetchIndexerDelegators(address, { first, skip, orderBy: 'stake', orderDirection: 'desc' })))}
          />
        }
      />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        {allocations ? (
          <DelegationCalculator
            indexer={{
              id: indexer.id,
              name,
              stakedTokens: indexer.stakedTokens,
              lockedTokens: indexer.lockedTokens,
              delegatedTokens: indexer.delegatedTokens,
              delegatedThawingTokens: indexer.delegatedThawingTokens,
              indexingRewardCut: indexer.indexingRewardCut,
              queryFeeCut: indexer.queryFeeCut,
              delegatorParameterCooldown: indexer.delegatorParameterCooldown,
              lastDelegationParameterUpdate: indexer.lastDelegationParameterUpdate,
              allocations,
              indexingRewardEffectiveCut: indexer.indexingRewardEffectiveCut ?? null,
            }}
            delegationRatio={delegationRatio}
            totalNetworkSignal={totalNetworkSignal}
            annualIssuance={annualIssuance}
            delegatorAPR={enrichedIndexer?.delegatorAPR ?? null}
          />
        ) : (
          <MissingSection
            title="Delegation Calculator"
            what="The APR estimate"
            detail={`It is computed from this indexer's active allocations, which could not be read. ${whyMissing(indexer, 'allocations')}`}
          />
        )}
      </div>
      </>
      )}

      {activeTab === 'overview' && (
      <>
        <div className="space-y-6">
          {/* Capacity */}
          <Card>
            <CardHeader>
              <CardTitle>Delegation Capacity</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="mb-4">
                <ProgressBar
                  value={capacity.utilizationPercent}
                  max={100}
                  showValue
                  variant={capacity.utilizationPercent > 90 ? 'orange' : 'teal'}
                  size="lg"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-center">
                <div>
                  <p className="text-xs text-[var(--text-faint)]">Max Capacity</p>
                  <p className="text-sm font-mono text-[var(--text)]">{formatGRT(capacity.maxCapacity)}</p>
                </div>
                <div>
                  <p className="text-xs text-[var(--text-faint)]">Used</p>
                  <p className="text-sm font-mono text-[var(--text)]">{formatGRT(capacity.usedCapacity)}</p>
                </div>
                <div>
                  <p className="text-xs text-[var(--text-faint)]">Available</p>
                  <p className="text-sm font-mono text-[var(--green)]">{formatGRT(capacity.availableCapacity)}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Parameters */}
          <Card>
            <CardHeader>
              <CardTitle>Parameters</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex justify-between items-center py-2 border-b border-[var(--border)]">
                  <span className="text-sm text-[var(--text-muted)]">Indexing Reward Cut</span>
                  <span className="font-mono text-[var(--text)]">{formatPPM(indexer.indexingRewardCut)}</span>
                </div>
                {effectiveCutPercent != null ? (
                  <div className="flex justify-between items-center py-2 border-b border-[var(--border)]">
                    <span className="text-sm text-[var(--text-muted)]">Effective Cut</span>
                    <span className="font-mono text-[var(--text)]">{effectiveCutPercent.toFixed(2)}%</span>
                  </div>
                ) : null}
                <div className="flex justify-between items-center py-2 border-b border-[var(--border)]">
                  <span className="text-sm text-[var(--text-muted)]">Query Fee Cut</span>
                  <span className="font-mono text-[var(--text)]">{formatPPM(indexer.queryFeeCut)}</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-[var(--border)]">
                  <span className="text-sm text-[var(--text-muted)]">Delegation Ratio</span>
                  <span className="font-mono text-[var(--text)]">{delegationRatio}x</span>
                </div>
                <div className="flex justify-between items-center py-2">
                  <span className="text-sm text-[var(--text-muted)]">Active Allocations</span>
                  <span className="font-mono text-[var(--text)]">{indexer.allocationCount}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </>
      )}

      {activeTab === 'performance' && (
      <>
      <IndexerQoSChart indexer={address} />

      {/* QoS Quality: the score, recomputed from the same postings */}
      <QosQualityPanel indexer={address} />
      </>
      )}

      {activeTab === 'rewards' && (
      <>
      <PnlPanel indexer={address} grtPrice={grtPrice} />
      </>
      )}

      {activeTab === 'overview' && (
      <>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        {/* Indexer Score Breakdown */}
        {indexerScore && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Indexer Score</CardTitle>
                <div className="flex items-center gap-2">
                  <span className={cn(
                    'text-2xl font-mono font-bold',
                    indexerScore.composite >= 80 ? 'text-[var(--green)]' :
                    indexerScore.composite >= 65 ? 'text-[var(--teal, var(--green))]' :
                    indexerScore.composite >= 50 ? 'text-[var(--amber)]' : 'text-[var(--red-text)]'
                  )}>
                    {indexerScore.composite}
                  </span>
                  <Badge variant={
                    indexerScore.grade === 'A' ? 'success' :
                    indexerScore.grade === 'B' ? 'accent' :
                    indexerScore.grade === 'C' ? 'warning' : 'error'
                  }>
                    {indexerScore.grade}
                  </Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {(Object.keys(SCORE_WEIGHTS) as Array<keyof typeof SCORE_WEIGHTS>).map((key) => {
                  const dimScore = indexerScore.breakdown[key];
                  const weight = SCORE_WEIGHTS[key];
                  const label = SCORE_LABELS[key];
                  return (
                    <div key={key}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-[var(--text-muted)]">
                          {label}
                          <span className="text-[var(--text-faint)] ml-1">({weight}%)</span>
                        </span>
                        <span className={cn(
                          'text-xs font-mono font-medium',
                          dimScore >= 80 ? 'text-[var(--green)]' :
                          dimScore >= 50 ? 'text-[var(--amber)]' : 'text-[var(--red-text)]'
                        )}>
                          {dimScore}
                        </span>
                      </div>
                      <div className="w-full h-1.5 rounded-full bg-[var(--bg-elevated)] overflow-hidden">
                        <div
                          className={cn(
                            'h-full rounded-full transition-all duration-500',
                            dimScore >= 80 ? 'bg-[var(--green)]' :
                            dimScore >= 50 ? 'bg-[var(--amber)]' : 'bg-[var(--red)]'
                          )}
                          style={{ width: `${dimScore}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
              <p className="text-[10px] text-[var(--text-faint)] mt-4 leading-relaxed">
                Composite score from 11 on-chain dimensions. Weights reflect delegator priorities: REO compliance (20%), allocation efficiency (13%), self-stake (12%), delegator cut (10%), delegation safety (9%), transparency (8%), delegator APY (8%), data service coverage (5%), query volume (6%), cut stability (6%), delegation trend (3%). Higher = better for delegators.
              </p>
            </CardContent>
          </Card>
        )}
        <div className="space-y-6">
          {/* REO Eligibility — direct oracle read. The oracle's own verdict
              (the badge) is authoritative; renewal timing is shown as context
              only and never contradicts it. */}
          {reoData?.status?.status && (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Rewards Eligibility</CardTitle>
                  <Badge variant={
                    reoData.status.status === 'eligible' ? 'success'
                      : reoData.status.status === 'ineligible' ? 'error'
                      : 'default'
                  }>
                    {reoData.status.status === 'eligible' ? 'Eligible'
                      : reoData.status.status === 'ineligible' ? 'Ineligible'
                      : 'Unavailable'}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                {reoData.status.status === 'unknown' ? (
                  <div className="space-y-2">
                    <p className="text-sm text-[var(--text-muted)]">
                      The on-chain REO oracle couldn&apos;t be reached, so this indexer&apos;s rewards eligibility can&apos;t be determined right now.
                    </p>
                    <p className="text-[10px] text-[var(--text-faint)] leading-relaxed">
                      Eligibility is read straight from the REO oracle contract (GIP-0079); we never estimate it. Please try again shortly.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {/* Renewal timing — informational only; the badge above is the verdict */}
                    {reoData.status.daysRemaining != null && (reoData.status.renewalTimestamp ?? 0) > 0 && reoData.status.daysRemaining > 0 && (
                      <div>
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-sm text-[var(--text-muted)]">Next renewal</span>
                          <span className="text-sm font-medium text-[var(--text)]">
                            ~{reoData.status.daysRemaining.toFixed(1)} days
                          </span>
                        </div>
                        {reoData.status.eligibilityPeriod != null && reoData.status.eligibilityPeriod > 0 && (
                          <ProgressBar
                            value={Math.max(0, Math.min(100, (reoData.status.daysRemaining / (reoData.status.eligibilityPeriod / 86400)) * 100))}
                            variant="teal"
                          />
                        )}
                      </div>
                    )}
                    {!reoData.status.renewalTimestamp && (
                      <p className="text-sm text-[var(--text-muted)]">
                        No renewal on record: the oracle has not yet posted an eligibility attestation for this indexer.
                      </p>
                    )}
                    {/* Timestamps */}
                    <div className="grid grid-cols-2 gap-3 text-[11px]">
                      {reoData.status.renewalTimestamp != null && reoData.status.renewalTimestamp > 0 && (
                        <div>
                          <p className="text-[var(--text-faint)]">Last renewed</p>
                          <p className="text-[var(--text)] font-mono">
                            {new Date(reoData.status.renewalTimestamp * 1000).toLocaleDateString()}
                          </p>
                        </div>
                      )}
                      {(reoData.status.renewalTimestamp ?? 0) > 0 && reoData.status.expiresAt != null && reoData.status.expiresAt > 0 && (
                        <div>
                          <p className="text-[var(--text-faint)]">Renewal due</p>
                          <p className="text-[var(--text)] font-mono">
                            {new Date(reoData.status.expiresAt * 1000).toLocaleDateString()}
                          </p>
                        </div>
                      )}
                    </div>
                    <p className="text-[10px] text-[var(--text-faint)] leading-relaxed">
                      Source: REO oracle contract (GIP-0079). The oracle counts active days, each needing qualifying queries (HTTP 200, under 5 s, within 50,000 blocks of chain head) on enough subgraphs, five or more days in a rolling 28, and renews eligibility for 14 days. The badge above reflects the oracle&apos;s own eligibility verdict; a due renewal does not mean an eligible indexer has stopped earning.
                    </p>
                    <ReoCoverage indexer={address} allocations={indexer.allocations} />
                  </div>
                )}
              </CardContent>
            </Card>
          )}

        </div>
      </div>
      </>
      )}

      {activeTab === 'performance' && (
      <>
          <FoghornAlertBanner />
          <FoghornScorecard address={address} />
      </>
      )}

      {activeTab === 'rewards' && (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        <StakeHistoryChart indexer={address} />
        <IndexerTrendsChart indexer={address} />
      </div>
      )}

      {activeTab === 'delegators' && (
        <DelegationFeed indexerAddress={address} />
      )}

      {activeTab === 'history' && (
        <ParameterHistory address={address} />
      )}

      {activeTab === 'overview' && (
      <>
          {(indexer.overDelegationDilution || indexer.ownStakeRatio || indexer.provisionedTokens) && (
            <Card>
              <CardHeader>
                <CardTitle>Horizon Metrics</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {indexer.ownStakeRatio && (
                    <div className="flex justify-between items-center py-2 border-b border-[var(--border)]">
                      <span className="text-sm text-[var(--text-muted)]">Own Stake Ratio</span>
                      <span className="font-mono text-[var(--text)]">{(parseFloat(indexer.ownStakeRatio) * 100).toFixed(1)}%</span>
                    </div>
                  )}
                  {indexer.indexerRewardsOwnGenerationRatio && (
                    <div className="flex justify-between items-center py-2 border-b border-[var(--border)]">
                      <span className="text-sm text-[var(--text-muted)]">Rewards Own Generation</span>
                      <span className={cn(
                        'font-mono',
                        parseFloat(indexer.indexerRewardsOwnGenerationRatio) > 1 ? 'text-[var(--amber)]' : 'text-[var(--text)]'
                      )}>
                        {(parseFloat(indexer.indexerRewardsOwnGenerationRatio) * 100).toFixed(1)}%
                      </span>
                    </div>
                  )}
                  {indexer.overDelegationDilution && parseFloat(indexer.overDelegationDilution) > 0 && (
                    <div className="flex justify-between items-center py-2 border-b border-[var(--border)]">
                      <span className="text-sm text-[var(--amber)]">Overdelegation Dilution</span>
                      <span className="font-mono text-[var(--amber)]">{(parseFloat(indexer.overDelegationDilution) * 100).toFixed(1)}%</span>
                    </div>
                  )}
                  {indexer.provisionedTokens && (
                    <div className="flex justify-between items-center py-2">
                      <span className="text-sm text-[var(--text-muted)]">Provisioned Stake</span>
                      <span className="font-mono text-[var(--text)]">{formatGRT(weiToGRT(indexer.provisionedTokens))} GRT</span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
      </>
      )}

      {activeTab === 'allocations' && (
        <AllocationsPanel
          indexer={address}
          allocations={allocations}
          closedAllocations={closedAllocations}
          whyAllocations={whyMissing(indexer, 'allocations')}
          whyClosed={whyMissing(indexer, 'closedAllocations')}
          statusDeployments={statusData?.deployments}
          statusSummary={statusData ? {
            syncedCount: statusData.syncedCount,
            syncingCount: statusData.syncingCount,
            failedCount: statusData.failedCount,
            unreachableCount: statusData.unreachableCount,
          } : undefined}
          statusLoading={statusLoading}
          node={node}
          foghornSuccess={(hash) => foghornAllocQos?.get(hash)?.successRate}
          currentEpoch={network?.currentEpoch ?? 0}
          epochLength={network?.epochLength ?? 0}
          nowSec={nowSec}
          networkRatio={
            network?.totalTokensAllocated && weiToGRT(network.totalTokensAllocated) > 0
              ? totalNetworkSignal / weiToGRT(network.totalTokensAllocated)
              : 0
          }
        />
      )}

      {activeTab === 'history' && (
        <DisputesSection address={address} />
      )}

      {activeTab === 'provisions' && (
      <ProvisionsPanel
        provisions={provisionsData?.provisions ?? []}
        isLoading={provisions.kind === 'loading'}
        unavailable={isUnavailable(provisions)}
        selfStakeGRT={selfStake}
      />
      )}
    </div>
  );
}
