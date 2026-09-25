'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAccount, useSignMessage } from 'wagmi';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge, type BadgeVariant } from '@/components/ui/Badge';
import { fetchPOIDeployment } from '@/lib/api';
import {
  COCKPIT_URL,
  approveActions,
  cancelActions,
  closeGate,
  closes,
  cockpitAction,
  DECISION_BASES,
  deleteRule,
  emptyRuleForm,
  fetchActions,
  fetchRules,
  ruleForm,
  ruleInput,
  setRule,
  weiToGrtText,
  fetchCockpitSession,
  queueActions,
  requestChallenge,
  signOutOfCockpit,
  verifySignature,
  type ActionStatus,
  type AgentAction,
  type CockpitActionType,
  type CockpitSession,
  type DecisionBasis,
  type IndexingRule,
  type RuleForm,
} from '@/lib/cockpit';
import { cn, shortenAddress } from '@/lib/utils';

const SESSION_KEY = ['cockpit', 'session'] as const;
const ACTIONS_KEY = ['cockpit', 'actions'] as const;
const RULES_KEY = ['cockpit', 'rules'] as const;
const button =
  'px-2.5 py-1.5 text-xs rounded-[var(--radius-button)] border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)] disabled:opacity-50';
const input =
  'px-2 py-1.5 text-xs rounded-[var(--radius-button)] border border-[var(--border)] bg-[var(--bg)] text-[var(--text)] font-mono';
const th = 'px-3 py-2 text-left text-[11px] font-medium text-[var(--text-muted)] whitespace-nowrap';
const td = 'px-3 py-2 text-xs';

function message(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export function Cockpit() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-[var(--text)]">Cockpit</h1>
        <p className="text-sm text-[var(--text-muted)] mt-1 max-w-3xl">
          Your indexer agent&apos;s action queue, through the Cockpit at{' '}
          <span className="font-mono">{COCKPIT_URL}</span>. Queued actions run when you approve them,
          as they would from <span className="font-mono">graph indexer actions</span>.
        </p>
      </div>
      <Suspense fallback={<div className="h-24 animate-pulse rounded bg-[var(--bg-elevated)]" />}>
        <SignedIn />
      </Suspense>
    </div>
  );
}

function SignedIn() {
  const session = useQuery({ queryKey: SESSION_KEY, queryFn: fetchCockpitSession, retry: false });
  if (session.isPending) return <div className="h-24 animate-pulse rounded bg-[var(--bg-elevated)]" />;
  if (session.isError) {
    return (
      <Card className="border-[var(--red-dim)]">
        <p className="text-sm text-[var(--red-text)]">The Cockpit could not be reached. {message(session.error)}</p>
      </Card>
    );
  }
  if (!session.data) return <SignIn />;
  return (
    <>
      <SessionBar session={session.data} />
      <QueueForm session={session.data} />
      <ActionQueue />
      <IndexingRules />
    </>
  );
}

function SignIn() {
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const qc = useQueryClient();
  const signIn = useMutation({
    mutationFn: async () => {
      if (!address) throw new Error('Connect a wallet first');
      const challenge = await requestChallenge(address);
      const signature = await signMessageAsync({ message: challenge.message });
      return verifySignature(challenge.nonce, signature);
    },
    onSuccess: (s) => qc.setQueryData(SESSION_KEY, s),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sign in</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm text-[var(--text-muted)]">
        <p className="max-w-3xl">
          Sign a message with the indexer wallet or one of its operator wallets. It sends no transaction.
          The Cockpit checks the signer against the indexer&apos;s operators on chain.
        </p>
        {isConnected ? (
          <button type="button" className={button} disabled={signIn.isPending} onClick={() => signIn.mutate()}>
            {signIn.isPending ? 'Waiting for the signature…' : `Sign in as ${shortenAddress(address ?? '')}`}
          </button>
        ) : (
          <p>Connect a wallet with the button in the top bar first.</p>
        )}
        {signIn.isError ? <p className="text-[var(--red-text)]">{message(signIn.error)}</p> : null}
      </CardContent>
    </Card>
  );
}

function SessionBar({ session }: { session: CockpitSession }) {
  const qc = useQueryClient();
  const signOut = useMutation({
    mutationFn: signOutOfCockpit,
    onSuccess: () => qc.setQueryData(SESSION_KEY, null),
  });
  return (
    <div className="flex flex-wrap items-center gap-3 text-xs text-[var(--text-muted)]">
      <span>
        Indexer <span className="font-mono text-[var(--text)]">{shortenAddress(session.indexer)}</span>
      </span>
      <span>
        signed in as <span className="font-mono text-[var(--text)]">{shortenAddress(session.signer)}</span>
      </span>
      <span>until {new Date(session.expiresAt * 1000).toLocaleTimeString()}</span>
      <button type="button" className={button} onClick={() => signOut.mutate()}>Sign out</button>
      {signOut.isError ? <span className="text-[var(--red-text)]">{message(signOut.error)}</span> : null}
    </div>
  );
}

const TYPES: CockpitActionType[] = ['allocate', 'unallocate', 'reallocate'];

function QueueForm({ session }: { session: CockpitSession }) {
  const params = useSearchParams();
  const initialType = params.get('type');
  const [type, setType] = useState<CockpitActionType>(
    TYPES.includes(initialType as CockpitActionType) ? (initialType as CockpitActionType) : 'allocate',
  );
  const [deployment, setDeployment] = useState(params.get('deployment') ?? '');
  const [allocation, setAllocation] = useState(params.get('allocation') ?? '');
  const [amount, setAmount] = useState(params.get('amount') ?? '');
  const [reason, setReason] = useState('');
  const [unchecked, setUnchecked] = useState<string | null>(null);
  const [skipCheck, setSkipCheck] = useState(false);
  const qc = useQueryClient();

  const queue = useMutation({
    mutationFn: async () => {
      const action = cockpitAction(type, { deploymentId: deployment, allocationId: allocation, amount, reason });
      if (closes(type)) {
        let detail = null;
        try {
          detail = await fetchPOIDeployment(action.deploymentID);
        } catch (e) {
          if (!skipCheck) {
            setUnchecked(message(e));
            throw new Error('POI consensus for this deployment could not be read, so the close was not checked.');
          }
        }
        const gate = closeGate(detail, session.indexer);
        if (gate.kind === 'diverged') {
          throw new Error(
            `Refused: your latest closed POI on this deployment (epoch ${gate.epoch}) disagreed with ` +
              `consensus, which held ${gate.consensusPct.toFixed(0)}% of stake. Check the deployment on /poi before closing.`,
          );
        }
      }
      return queueActions([action]);
    },
    onSuccess: () => {
      setUnchecked(null);
      setSkipCheck(false);
      return qc.invalidateQueries({ queryKey: ACTIONS_KEY });
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Queue an action</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-[var(--text-muted)] max-w-3xl">
          Amounts are GRT. An unallocate or reallocate is refused when your latest closed POI on the deployment
          disagreed with stake-weighted consensus. Open it from a row of your allocations table to have it
          filled in.
        </p>
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-[11px] text-[var(--text-muted)]">
            Action
            <select className={input} value={type} onChange={(e) => setType(e.target.value as CockpitActionType)}>
              {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-[11px] text-[var(--text-muted)]">
            Deployment
            <input className={cn(input, 'w-[28rem] max-w-full')} value={deployment} onChange={(e) => setDeployment(e.target.value)} placeholder="Qm…" />
          </label>
          {type !== 'allocate' ? (
            <label className="flex flex-col gap-1 text-[11px] text-[var(--text-muted)]">
              Allocation
              <input className={cn(input, 'w-[24rem] max-w-full')} value={allocation} onChange={(e) => setAllocation(e.target.value)} placeholder="0x…" />
            </label>
          ) : null}
          {type !== 'unallocate' ? (
            <label className="flex flex-col gap-1 text-[11px] text-[var(--text-muted)]">
              Amount (GRT)
              <input className={cn(input, 'w-32')} value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" />
            </label>
          ) : null}
          <label className="flex flex-col gap-1 text-[11px] text-[var(--text-muted)]">
            Reason
            <input className={cn(input, 'w-48 font-sans')} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} />
          </label>
          <button type="button" className={button} disabled={queue.isPending} onClick={() => queue.mutate()}>
            {queue.isPending ? 'Queueing…' : 'Queue'}
          </button>
        </div>
        {unchecked ? (
          <label className="flex items-center gap-2 text-xs text-[var(--amber)]">
            <input type="checkbox" checked={skipCheck} onChange={(e) => setSkipCheck(e.target.checked)} className="accent-[var(--amber)]" />
            Queue without the consensus check ({unchecked})
          </label>
        ) : null}
        {queue.isError ? <p className="text-xs text-[var(--red-text)]">{message(queue.error)}</p> : null}
        {queue.isSuccess ? (
          <p className="text-xs text-[var(--green)]">Queued as action {queue.data.map((a) => a.id).join(', ')}.</p>
        ) : null}
      </CardContent>
    </Card>
  );
}

const STATUS_VARIANT: Record<ActionStatus, BadgeVariant> = {
  queued: 'default',
  approved: 'accent',
  deploying: 'warning',
  pending: 'warning',
  success: 'success',
  failed: 'error',
  canceled: 'default',
};

const FILTERS: (ActionStatus | 'all')[] = ['queued', 'approved', 'pending', 'failed', 'success', 'canceled', 'all'];

function ActionQueue() {
  const [filter, setFilter] = useState<ActionStatus | 'all'>('queued');
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const qc = useQueryClient();
  const actions = useQuery({
    queryKey: [...ACTIONS_KEY, filter],
    queryFn: () => fetchActions(filter === 'all' ? undefined : filter),
    refetchInterval: 15_000,
  });
  const act = useMutation({
    mutationFn: (op: 'approve' | 'cancel') => (op === 'approve' ? approveActions : cancelActions)([...selected]),
    onSuccess: () => {
      setSelected(new Set());
      return qc.invalidateQueries({ queryKey: ACTIONS_KEY });
    },
  });
  const toggle = (id: number) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const rows: AgentAction[] = actions.data ?? [];

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle>Action queue</CardTitle>
          <select className={cn(input, 'ml-auto font-sans')} value={filter} onChange={(e) => setFilter(e.target.value as ActionStatus | 'all')}>
            {FILTERS.map((f) => <option key={f} value={f}>{f}</option>)}
          </select>
          <button type="button" className={button} disabled={selected.size === 0 || act.isPending} onClick={() => act.mutate('approve')}>
            Approve ({selected.size})
          </button>
          <button type="button" className={button} disabled={selected.size === 0 || act.isPending} onClick={() => act.mutate('cancel')}>
            Cancel ({selected.size})
          </button>
        </div>
      </CardHeader>
      <CardContent>
        {act.isError ? <p className="mb-2 text-xs text-[var(--red-text)]">{message(act.error)}</p> : null}
        {actions.isPending ? (
          <div className="h-24 animate-pulse rounded bg-[var(--bg-elevated)]" />
        ) : actions.isError ? (
          <p className="text-sm text-[var(--red-text)]">The action queue could not be read. {message(actions.error)}</p>
        ) : rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-[var(--text-muted)]">No {filter === 'all' ? '' : `${filter} `}actions.</p>
        ) : (
          <div className="overflow-x-auto -mx-4">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[var(--border)]">
                  <th className="w-8" />
                  <th className={th}>ID</th>
                  <th className={th}>Action</th>
                  <th className={th}>Deployment</th>
                  <th className={th}>Allocation</th>
                  <th className={cn(th, 'text-right')}>GRT</th>
                  <th className={th}>Status</th>
                  <th className={th}>Source</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {rows.map((a) => (
                  <tr key={a.id} className="hover:bg-[var(--bg-elevated)] align-top">
                    <td className="px-2 py-2">
                      <input
                        type="checkbox"
                        aria-label={`Select action ${a.id}`}
                        checked={selected.has(a.id)}
                        onChange={() => toggle(a.id)}
                        className="accent-[var(--accent)]"
                      />
                    </td>
                    <td className={cn(td, 'font-mono')}>{a.id}</td>
                    <td className={td}>{a.type}</td>
                    <td className={cn(td, 'font-mono')}>{a.deploymentID ?? '—'}</td>
                    <td className={cn(td, 'font-mono')}>{a.allocationID ? shortenAddress(a.allocationID) : '—'}</td>
                    <td className={cn(td, 'font-mono text-right')}>{a.amount ?? '—'}</td>
                    <td className={td}>
                      <Badge variant={STATUS_VARIANT[a.status] ?? 'default'}>{a.status}</Badge>
                      {a.failureReason ? (
                        <p className="mt-1 max-w-xs text-[10px] text-[var(--red-text)]">{a.failureReason}</p>
                      ) : null}
                    </td>
                    <td className={cn(td, 'text-[var(--text-muted)]')}>{a.source}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

const RULE_FIELDS: { key: keyof RuleForm; label: string; placeholder: string }[] = [
  { key: 'allocationAmount', label: 'Allocation amount (GRT)', placeholder: 'unchanged' },
  { key: 'parallelAllocations', label: 'Parallel allocations', placeholder: 'unchanged' },
  { key: 'minSignal', label: 'Minimum signal (GRT)', placeholder: 'unchanged' },
  { key: 'minStake', label: 'Minimum stake (GRT)', placeholder: 'unchanged' },
  { key: 'minAverageQueryFees', label: 'Minimum average query fees (GRT)', placeholder: 'unchanged' },
  { key: 'maxAllocationPercent', label: 'Maximum allocation share (%)', placeholder: 'unchanged' },
];

function grt(wei: string | null): string {
  const t = weiToGrtText(wei);
  return t == null ? '—' : Number(t).toLocaleString('en-US', { maximumFractionDigits: 2 });
}

function IndexingRules() {
  const qc = useQueryClient();
  const rules = useQuery({ queryKey: RULES_KEY, queryFn: fetchRules });
  const [form, setForm] = useState<RuleForm>(emptyRuleForm('global'));
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: () => setRule(ruleInput(form)),
    onSuccess: () => qc.invalidateQueries({ queryKey: RULES_KEY }),
  });
  const remove = useMutation({
    mutationFn: deleteRule,
    onSuccess: () => {
      setConfirmDelete(null);
      return qc.invalidateQueries({ queryKey: RULES_KEY });
    },
  });
  const rows: IndexingRule[] = rules.data ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Indexing rules</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-[var(--text-muted)] max-w-3xl">
          What the agent allocates to on its own, as <span className="font-mono">graph indexer rules</span> sets it. A
          deployment rule overrides <span className="font-mono">global</span> for the fields it names. Blank fields keep
          what the agent has.
        </p>
        {rules.isPending ? (
          <div className="h-16 animate-pulse rounded bg-[var(--bg-elevated)]" />
        ) : rules.isError ? (
          <p className="text-sm text-[var(--red-text)]">The rules could not be read. {message(rules.error)}</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-[var(--text-muted)]">The agent has no rules.</p>
        ) : (
          <div className="overflow-x-auto -mx-4">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[var(--border)]">
                  <th className={th}>Identifier</th>
                  <th className={th}>Decision</th>
                  <th className={cn(th, 'text-right')}>Allocation</th>
                  <th className={cn(th, 'text-right')}>Parallel</th>
                  <th className={cn(th, 'text-right')}>Min signal</th>
                  <th className={cn(th, 'text-right')}>Min stake</th>
                  <th className={th} />
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {rows.map((r) => (
                  <tr key={`${r.identifierType}:${r.identifier}`} className="hover:bg-[var(--bg-elevated)]">
                    <td className={cn(td, 'font-mono')} title={r.identifier}>
                      {r.identifier.length > 20 ? `${r.identifier.slice(0, 8)}…${r.identifier.slice(-6)}` : r.identifier}
                    </td>
                    <td className={td}>{r.decisionBasis ?? '—'}</td>
                    <td className={cn(td, 'text-right font-mono')}>{grt(r.allocationAmount)}</td>
                    <td className={cn(td, 'text-right font-mono')}>{r.parallelAllocations ?? '—'}</td>
                    <td className={cn(td, 'text-right font-mono')}>{grt(r.minSignal)}</td>
                    <td className={cn(td, 'text-right font-mono')}>{grt(r.minStake)}</td>
                    <td className={cn(td, 'text-right whitespace-nowrap')}>
                      {r.identifierType === 'subgraph' ? (
                        <span className="text-[var(--text-faint)]">edit with indexer-cli</span>
                      ) : (
                        <>
                          <button type="button" className={button} onClick={() => setForm(ruleForm(r))}>Edit</button>{' '}
                          {confirmDelete === r.identifier ? (
                            <button type="button" className={cn(button, 'text-[var(--red-text)]')} disabled={remove.isPending} onClick={() => remove.mutate(r.identifier)}>
                              Really delete
                            </button>
                          ) : (
                            <button type="button" className={button} onClick={() => setConfirmDelete(r.identifier)}>Delete</button>
                          )}
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {remove.isError ? <p className="text-xs text-[var(--red-text)]">{message(remove.error)}</p> : null}

        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <label className="flex flex-col gap-1 text-[11px] text-[var(--text-muted)] lg:col-span-2">
              Rule for
              <input className={input} value={form.identifier} placeholder="global or Qm…" onChange={(e) => setForm({ ...form, identifier: e.target.value })} />
            </label>
            <label className="flex flex-col gap-1 text-[11px] text-[var(--text-muted)]">
              Decision basis
              <select className={cn(input, 'font-sans')} value={form.decisionBasis} onChange={(e) => setForm({ ...form, decisionBasis: e.target.value as DecisionBasis | '' })}>
                <option value="">unchanged</option>
                {DECISION_BASES.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            </label>
            {RULE_FIELDS.map((f) => (
              <label key={f.key} className="flex flex-col gap-1 text-[11px] text-[var(--text-muted)]">
                {f.label}
                <input className={input} inputMode="decimal" placeholder={f.placeholder} value={form[f.key]} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} />
              </label>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="submit" className={button} disabled={save.isPending}>{save.isPending ? 'Saving…' : 'Save rule'}</button>
            <button type="button" className={button} onClick={() => setForm(emptyRuleForm('global'))}>Clear</button>
            {save.isError ? <span className="text-xs text-[var(--red-text)]">{message(save.error)}</span> : null}
            {save.isSuccess ? <span className="text-xs text-[var(--text-muted)]">Saved.</span> : null}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

