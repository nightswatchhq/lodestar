// Moved from @/lib/contracts/dips when the rollback handler was deleted. See README.md.

export interface DipsAllocation {
  target: string;
  label: string;
  /** GRT per block allocated to this target, whoever does the minting. */
  rate: number;
  /** Share of total issuance, 0-100. */
  sharePct: number;
  /**
   * True when the target mints its own share rather than receiving it from the allocator. A
   * mechanism, not an amount: `rate` is the same either way.
   */
  selfMinting: boolean;
  /**
   * Unix seconds of the most recent issuance actually delivered to this target, by either
   * mechanism. Null means a rate is configured and nothing has ever been seen to move under it,
   * which is not the same as a rate of zero.
   */
  lastDistributedAt: number | null;
  /**
   * True when this target has a non-zero configured rate and no delivery has ever been observed.
   * The gap between what governance set and what the chain did.
   */
  configuredNotDistributed: boolean;
  /**
   * True when the rate is read from an actual TargetAllocationUpdated event rather than inferred.
   * DefaultAllocation has never emitted one, so its zero is an absence, not a measurement — and an
   * absence rendered as a confident zero is exactly how a dashboard lies.
   */
  observed: boolean;
}

export interface DipsStep {
  block: number;
  timestamp: number;
  txHash: string;
  step: string;
  label: string;
  subject: string;
  subjectLabel: string | null;
  rate: number | null;
}
