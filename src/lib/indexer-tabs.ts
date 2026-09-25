export const INDEXER_TABS = [
  'overview',
  'allocations',
  'plan',
  'rewards',
  'provisions',
  'performance',
  'delegators',
  'history',
] as const;

export type IndexerTab = (typeof INDEXER_TABS)[number];

export const INDEXER_TAB_LABELS: { id: IndexerTab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'allocations', label: 'Allocations' },
  { id: 'plan', label: 'Plan' },
  { id: 'rewards', label: 'Rewards' },
  { id: 'provisions', label: 'Provisions' },
  { id: 'performance', label: 'Performance' },
  { id: 'delegators', label: 'Delegators' },
  { id: 'history', label: 'History' },
];

/**
 * The tab in `?tab=`, or the default. Allocations is the default when the connected
 * wallet is this indexer or one of its operators, so an operator lands on the loop
 * they came to do. An unknown `tab` is ignored rather than inventing a page.
 */
export function parseIndexerTab(
  raw: string | null,
  opts: {
    connected?: string | null;
    indexerId: string;
    operatorIds?: string[];
  },
): IndexerTab {
  if (raw && (INDEXER_TABS as readonly string[]).includes(raw)) {
    return raw as IndexerTab;
  }
  const wallet = opts.connected?.toLowerCase();
  if (!wallet) return 'overview';
  if (wallet === opts.indexerId.toLowerCase()) return 'allocations';
  if ((opts.operatorIds ?? []).some((id) => id.toLowerCase() === wallet)) return 'allocations';
  return 'overview';
}
