import type { Metadata } from 'next';

import Watchlist from './Watchlist';

export const metadata: Metadata = {
  title: 'Watchlist | Lodestar',
  description: 'The indexers and subgraphs you have starred, side by side.',
};

export default function WatchlistPage() {
  return <Watchlist />;
}
