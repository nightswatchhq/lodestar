// Moved from @/lib/contracts/delegate-recommend when the rollback handler was deleted. See README.md.
import type { EnrichedIndexer } from '@/lib/enriched';

export type RecommendResponse = {
  indexer: EnrichedIndexer;
  score: number;
  reasons: string[];
};
