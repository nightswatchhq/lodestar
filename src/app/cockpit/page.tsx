import type { Metadata } from 'next';

import { Cockpit } from '@/components/cockpit/Cockpit';
import { CockpitExplainer } from '@/components/cockpit/CockpitExplainer';
import { COCKPIT_URL } from '@/lib/cockpit';

export const metadata: Metadata = {
  title: 'Cockpit | Lodestar',
  description: 'Queue, approve and cancel allocation actions on your own indexer agent, from a self-hosted Lodestar.',
};

export default function CockpitPage() {
  return COCKPIT_URL ? <Cockpit /> : <CockpitExplainer />;
}
