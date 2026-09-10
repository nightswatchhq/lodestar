'use client';

import { MySubgraphsTab } from '@/features/dock/components/MySubgraphsTab';
import { useSession } from '@/features/dock/api';

/**
 * The address comes from the session cache rather than a prop, because the layout that gated this
 * route on being signed in cannot pass one to a child it renders as `children`. It is the same
 * react-query entry the layout already read, so there is no second request.
 */
export default function DockSubgraphsPage() {
  const { data } = useSession();
  if (!data?.address) return null;
  return <MySubgraphsTab sessionAddress={data.address} />;
}
