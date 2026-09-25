'use client';

import { useState } from 'react';
import { useQueries } from '@tanstack/react-query';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { createSubscription, deleteSubscription, fetchSubscription } from '@/lib/foghorn';
import {
  ALERT_KINDS,
  loadSaved,
  storeSaved,
  type AlertKind,
  type SavedSubscription,
} from '@/lib/alert-subscriptions';
import { formatRelativeTime, cn } from '@/lib/utils';

const inputClass = cn(
  'w-full min-w-0 px-2 py-1 text-xs font-mono rounded-[var(--radius-button)]',
  'bg-[var(--bg-surface)] border border-[var(--border)] text-[var(--text)]',
  'placeholder:text-[var(--text-faint)] focus:outline-none focus:border-[var(--accent)]',
);

function browserStorage(): Storage | undefined {
  try {
    return typeof window === 'undefined' ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
}

export function AlertsPanel({ indexer }: { indexer: string }) {
  // The page mounts this per indexer, and only in the browser, so storage is readable on first render.
  const [saved, setSaved] = useState<SavedSubscription[]>(() => loadSaved(browserStorage(), indexer));
  const [webhook, setWebhook] = useState('');
  const [kinds, setKinds] = useState<AlertKind[]>(ALERT_KINDS.map((k) => k.id));
  const [pctText, setPctText] = useState('20');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const infos = useQueries({
    queries: saved.map((s) => ({
      queryKey: ['alertSubscription', s.id],
      queryFn: () => fetchSubscription(s),
      staleTime: 60_000,
    })),
  });

  const keep = (next: SavedSubscription[]) => {
    setSaved(next);
    storeSaved(browserStorage(), indexer, next);
  };

  const pct = Number(pctText);
  const valid = webhook.startsWith('https://') && kinds.length > 0 && Number.isFinite(pct) && pct >= 1 && pct <= 1000;

  const subscribe = async () => {
    setBusy(true);
    setError(null);
    try {
      const s = await createSubscription({ indexer, webhookUrl: webhook.trim(), kinds, signalMovePct: pct });
      keep([...saved, s]);
      setWebhook('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The subscription could not be made.');
    } finally {
      setBusy(false);
    }
  };

  const unsubscribe = async (s: SavedSubscription) => {
    setError(null);
    try {
      await deleteSubscription(s);
      keep(saved.filter((x) => x.id !== s.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The subscription could not be removed.');
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Alerts</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-[var(--text-muted)]">
          Foghorn checks this indexer every fifteen minutes and posts to a Discord or other webhook when something changes.
          The data is public, so anyone may subscribe; the webhook has to answer a test post first. The first check only
          records where things stand.
        </p>

        {saved.length > 0 ? (
          <ul className="space-y-2">
            {saved.map((s, i) => {
              const q = infos[i];
              const info = q?.data;
              return (
                <li key={s.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs border-b border-[var(--border)] pb-2 last:border-0">
                  {q?.isLoading ? (
                    <span className="text-[var(--text-muted)]">Loading…</span>
                  ) : info === null ? (
                    <span className="text-[var(--text-muted)]">Foghorn no longer has this subscription.</span>
                  ) : info ? (
                    <>
                      <span className="font-mono text-[var(--text)]">{info.webhook_host}</span>
                      <span className="text-[var(--text-muted)]">{info.kinds.join(', ')}</span>
                      <span className={info.disabled || info.consecutive_failures > 0 ? 'text-[var(--red-text)]' : 'text-[var(--text-muted)]'}>
                        {info.disabled
                          ? `stopped: ${info.last_error ?? 'posts kept failing'}`
                          : info.consecutive_failures > 0
                            ? `failing: ${info.last_error ?? 'unknown'}`
                            : info.last_delivered_at
                              ? `last alert ${formatRelativeTime(Date.parse(info.last_delivered_at) / 1000)}`
                              : info.last_evaluated_at
                                ? 'watching, nothing to report yet'
                                : 'waiting for its first check'}
                      </span>
                    </>
                  ) : (
                    <span className="text-[var(--red-text)]">Foghorn could not be reached.</span>
                  )}
                  <button
                    type="button"
                    onClick={() => void (info === null ? keep(saved.filter((x) => x.id !== s.id)) : unsubscribe(s))}
                    className="ml-auto text-[var(--text-faint)] hover:text-[var(--text)]"
                  >
                    {info === null ? 'Forget' : 'Unsubscribe'}
                  </button>
                </li>
              );
            })}
          </ul>
        ) : null}

        <div className="space-y-3">
          <label className="flex flex-col gap-1 text-[11px] text-[var(--text-muted)]">
            Webhook URL
            <input
              className={inputClass}
              placeholder="https://discord.com/api/webhooks/…"
              value={webhook}
              onChange={(e) => setWebhook(e.target.value)}
            />
          </label>
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            {ALERT_KINDS.map((k) => (
              <label key={k.id} className="flex items-center gap-1.5 text-xs text-[var(--text)]" title={k.hint}>
                <input
                  type="checkbox"
                  checked={kinds.includes(k.id)}
                  onChange={(e) => setKinds((ks) => (e.target.checked ? [...ks, k.id] : ks.filter((x) => x !== k.id)))}
                />
                {k.label}
              </label>
            ))}
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-[11px] text-[var(--text-muted)] w-40">
              Signal move (%)
              <input className={inputClass} inputMode="decimal" value={pctText} onChange={(e) => setPctText(e.target.value)} />
            </label>
            <button
              type="button"
              disabled={!valid || busy}
              onClick={() => void subscribe()}
              className={cn(
                'px-3 py-1.5 text-xs rounded-[var(--radius-button)] border transition-colors',
                valid && !busy
                  ? 'border-[var(--accent)] text-[var(--accent-text)] hover:bg-[var(--accent-dim)]'
                  : 'border-[var(--border)] text-[var(--text-faint)] cursor-not-allowed',
              )}
            >
              {busy ? 'Sending a test post…' : 'Subscribe'}
            </button>
          </div>
          {error ? <p className="text-xs text-[var(--red-text)]">{error}</p> : null}
          <p className="text-[11px] text-[var(--text-faint)]">
            This browser keeps the key that removes the subscription. Telegram and email are not offered yet.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
