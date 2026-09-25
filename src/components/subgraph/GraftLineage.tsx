'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { fetchGraftChildren } from '@/lib/api';
import { fetchGraftLineage } from '@/lib/graft-lineage';
import { useQueryState } from '@/hooks/useQueryState';
import type { ManifestAnalysis } from '@/lib/manifest';
import { formatNumber } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';

export function GraftLineage({ hash, graft }: { hash: string; graft: ManifestAnalysis['graft'] }) {
  const ancestors = useQuery({
    queryKey: ['graftLineage', hash, graft?.base, graft?.block],
    queryFn: () => fetchGraftLineage(graft!),
    enabled: graft !== null,
  });
  const ancestorsState = useQueryState(ancestors);
  const children = useQuery({
    queryKey: ['graftChildren', hash],
    queryFn: () => fetchGraftChildren(hash),
  });
  const childrenState = useQueryState(children);

  if (!graft && childrenState.kind === 'ready' && childrenState.data.children.length === 0) return null;

  return (
    <Card>
      <CardHeader><CardTitle>Graft lineage</CardTitle></CardHeader>
      <CardContent className="space-y-5 text-sm">
        {graft && (
          <section className="space-y-2">
            <h3 className="font-medium text-[var(--text)]">Grafted from</h3>
            {ancestorsState.kind === 'loading' && <p className="text-[var(--text-muted)]">Reading base manifests…</p>}
            {(ancestorsState.kind === 'failed' || ancestorsState.kind === 'unreachable') && <p className="text-[var(--red-text)]">Base lineage could not be loaded.</p>}
            {ancestorsState.kind === 'ready' && ancestorsState.data.ancestors.map((base) => (
              <div key={base.hash} className="border-l border-[var(--border)] pl-3 space-y-1">
                <Link href={`/subgraphs/${base.hash}`} className="text-[var(--accent-text)] hover:underline">
                  {base.name ?? base.hash}{base.label && ` · ${base.label}`}
                </Link>
                <p className="font-mono text-xs text-[var(--text-faint)] break-all">{base.hash}</p>
                <p className="text-xs text-[var(--text-muted)]">
                  Grafted at block {formatNumber(base.block)}.{' '}
                  {base.health === 'healthy_past_block' && 'A healthy indexer has passed that block.'}
                  {base.health === 'no_healthy_indexer' && 'No healthy indexer was verified past that block.'}
                  {base.health === 'unknown' && 'Indexer status could not be checked.'}
                  {!base.manifestAvailable && ' The base manifest could not be read.'}
                </p>
              </div>
            ))}
            {ancestorsState.kind === 'ready' && !ancestorsState.data.complete && (
              <p className="text-xs text-[var(--text-muted)]">The base chain could not be followed to its origin.</p>
            )}
          </section>
        )}
        <section className="space-y-2">
          <h3 className="font-medium text-[var(--text)]">Deployments grafted onto this one</h3>
          {childrenState.kind === 'loading' && <p className="text-[var(--text-muted)]">Finding known grafts…</p>}
          {(childrenState.kind === 'failed' || childrenState.kind === 'unreachable') && <p className="text-[var(--red-text)]">Known grafts could not be loaded.</p>}
          {childrenState.kind === 'ready' && childrenState.data.children.length === 0 && (
            <p className="text-[var(--text-muted)]">No grafts found in the fetched manifests.</p>
          )}
          {childrenState.kind === 'ready' && childrenState.data.children.map((child) => (
            <div key={child.ipfsHash} className="border-l border-[var(--border)] pl-3">
              <Link href={`/subgraphs/${child.ipfsHash}`} className="text-[var(--accent-text)] hover:underline">
                {child.displayName ?? child.ipfsHash}{child.label && ` · ${child.label}`}
              </Link>
              <p className="text-xs text-[var(--text-muted)]">Grafts at block {formatNumber(child.graftBlock)}</p>
            </div>
          ))}
          {childrenState.kind === 'ready' && (
            <p className="text-xs text-[var(--text-faint)]">This list covers manifests fetched by the backend so far.</p>
          )}
        </section>
      </CardContent>
    </Card>
  );
}
