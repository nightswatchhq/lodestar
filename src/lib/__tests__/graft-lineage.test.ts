import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchGraftLineage } from '../graft-lineage';
import * as api from '../api';

vi.mock('../api', () => ({
  fetchSubgraphDeployment: vi.fn(),
  fetchSubgraphVersions: vi.fn(),
  fetchIndexingStatus: vi.fn(),
  fetchManifestAnalysis: vi.fn(),
}));

beforeEach(() => vi.resetAllMocks());

describe('graft lineage', () => {
  it('follows bases through an unpublished deployment and keeps unread health distinct', async () => {
    vi.mocked(api.fetchSubgraphDeployment).mockResolvedValue(null);
    vi.mocked(api.fetchSubgraphVersions).mockResolvedValue({ subgraphId: null, versions: [] });
    vi.mocked(api.fetchIndexingStatus)
      .mockResolvedValueOnce({ indexers: [{ health: 'healthy', latestBlock: 120 }] } as never)
      .mockRejectedValueOnce(new Error('status endpoints unavailable'));
    vi.mocked(api.fetchManifestAnalysis)
      .mockResolvedValueOnce({ graft: { base: 'QmOrigin', block: 50 } } as never)
      .mockResolvedValueOnce({ graft: null } as never);

    const lineage = await fetchGraftLineage({ base: 'QmBase', block: 100 });
    expect(lineage.complete).toBe(true);
    expect(lineage.ancestors.map((base) => base.hash)).toEqual(['QmBase', 'QmOrigin']);
    expect(lineage.ancestors.map((base) => base.health)).toEqual(['healthy_past_block', 'unknown']);
  });
});
