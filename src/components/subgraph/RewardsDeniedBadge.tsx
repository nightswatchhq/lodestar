import { Badge } from '@/components/ui/Badge';

export function RewardsDeniedBadge({ deniedAt }: { deniedAt: number | null | undefined }) {
  if (deniedAt == null) return null;
  return (
    <Badge
      variant="error"
      className="whitespace-nowrap shrink-0"
      title={`On the RewardsManager denylist since block ${deniedAt.toLocaleString()}: allocations here earn no indexing rewards`}
    >
      Rewards denied
    </Badge>
  );
}
