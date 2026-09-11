// Moved from @/lib/contracts/horizon-activity when the rollback handler was deleted. See README.md.

export interface ActivityEvent {
  id: string;
  type:
    | 'delegated'
    | 'undelegated'
    | 'withdrawn'
    | 'delegation_slash'
    | 'stake_deposit'
    | 'stake_lock'
    | 'stake_withdraw'
    | 'provision'
    | 'provision_slash';
  block: number;
  txHash: string;
  timestamp?: number;
  serviceProvider: string;
  verifier?: string;
  delegator?: string;
  tokensGRT: number;
}
