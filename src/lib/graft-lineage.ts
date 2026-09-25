import {
  fetchIndexingStatus,
  fetchManifestAnalysis,
  fetchSubgraphDeployment,
  fetchSubgraphVersions,
} from './api';
import type { ManifestAnalysis } from './manifest';

export interface GraftAncestor {
  hash: string;
  block: number;
  name: string | null;
  label: string | null;
  health: 'healthy_past_block' | 'no_healthy_indexer' | 'unknown';
  manifestAvailable: boolean;
}

export interface GraftLineage {
  ancestors: GraftAncestor[];
  complete: boolean;
}

/** Follow manifest graft bases. A failed read leaves the last known base visible. */
export async function fetchGraftLineage(first: NonNullable<ManifestAnalysis['graft']>): Promise<GraftLineage> {
  const ancestors: GraftAncestor[] = [];
  const seen = new Set<string>();
  let graft: ManifestAnalysis['graft'] = first;

  while (graft && ancestors.length < 20) {
    const base: string = graft.base;
    const block: number = graft.block;
    if (seen.has(base)) return { ancestors, complete: false };
    seen.add(base);

    const [deployment, versions, status, manifestResult] = await Promise.allSettled([
      fetchSubgraphDeployment(base),
      fetchSubgraphVersions(base),
      fetchIndexingStatus(base),
      fetchManifestAnalysis(base),
    ]);
    const manifest: PromiseSettledResult<ManifestAnalysis> = manifestResult;
    const version = versions.status === 'fulfilled'
      ? versions.value.versions.find((v) => v.ipfsHash === base)
      : null;
    const healthy = status.status === 'fulfilled' && status.value.indexers.some(
      (indexer) => indexer.health === 'healthy' && (indexer.latestBlock ?? -1) >= block,
    );
    ancestors.push({
      hash: base,
      block,
      name: deployment.status === 'fulfilled' ? deployment.value?.displayName ?? null : null,
      label: version?.label ?? (version ? `v${version.version}` : null),
      health: status.status === 'rejected' ? 'unknown' : healthy ? 'healthy_past_block' : 'no_healthy_indexer',
      manifestAvailable: manifest.status === 'fulfilled',
    });
    if (manifest.status === 'rejected') return { ancestors, complete: false };
    graft = manifest.value.graft;
  }

  return { ancestors, complete: graft === null };
}
