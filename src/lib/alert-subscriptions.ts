/**
 * Alert subscriptions (#256), kept by Foghorn; the requests are in `foghorn.ts`. The browser keeps
 * each subscription's manage token, since that token is the only way to read or remove it again.
 */

export const ALERT_KINDS = [
  { id: 'poi', label: 'POI going stale', hint: 'An allocation enters the amber or red window.' },
  { id: 'denied', label: 'Rewards denied', hint: 'A deployment you allocate to joins or leaves the denylist.' },
  { id: 'signal', label: 'Signal moving', hint: 'Signal on an allocated deployment moves by the share below.' },
  { id: 'cuts', label: 'Cuts changing', hint: 'Your indexing or query fee cut changes.' },
  { id: 'reo', label: 'REO status', hint: 'Your rewards eligibility status changes.' },
] as const;

export type AlertKind = (typeof ALERT_KINDS)[number]['id'];

export interface SavedSubscription {
  id: string;
  token: string;
}

export interface SubscriptionInfo {
  id: string;
  indexer: string;
  webhook_host: string;
  kinds: AlertKind[];
  signal_move_pct: number;
  created_at: string;
  last_evaluated_at: string | null;
  last_delivered_at: string | null;
  consecutive_failures: number;
  last_error: string | null;
  disabled: boolean;
}

const key = (indexer: string) => `lodestar.alerts.${indexer.toLowerCase()}`;

export function loadSaved(storage: Pick<Storage, 'getItem'> | undefined, indexer: string): SavedSubscription[] {
  try {
    const raw = storage?.getItem(key(indexer));
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed)
      ? parsed.filter((s): s is SavedSubscription => typeof s?.id === 'string' && typeof s?.token === 'string')
      : [];
  } catch {
    return [];
  }
}

export function storeSaved(storage: Pick<Storage, 'setItem'> | undefined, indexer: string, subs: SavedSubscription[]): void {
  try {
    storage?.setItem(key(indexer), JSON.stringify(subs));
  } catch {
    // A private window refuses storage; the subscription still exists, only this browser forgets it.
  }
}
