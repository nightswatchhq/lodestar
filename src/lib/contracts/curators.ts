// Moved from @/lib/contracts/curators when the rollback handler was deleted. See README.md.

export interface CuratorLeaderboardEntry {
  id: string;
  totalSignalledTokens: string;
  totalUnsignalledTokens: string;
  realizedRewards: string;
  signalCount: number;
  activeSignalCount: number;
}
