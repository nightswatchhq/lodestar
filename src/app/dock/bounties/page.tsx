'use client';

import { BountyBoardTab } from '@/features/dock/components/BountyBoardTab';
import { useSession } from '@/features/dock/api';

export default function DockBountiesPage() {
  const { data } = useSession();
  if (!data?.address) return null;
  return <BountyBoardTab sessionAddress={data.address} />;
}
