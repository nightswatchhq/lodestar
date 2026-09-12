'use client';

/**
 * Every HTTP call the Dock makes, as one hook each.
 *
 * Two reasons this exists rather than the twelve inline `fetch` calls it replaces.
 *
 * **It is the API inventory the kittiwake port needs.** Each hook is one method, one path, one
 * request shape and one response shape, written down. That is exactly what the parity harness
 * compares, and the absence of it is what nightswatchhq/kittiwake#23 cost: two lists that had to
 * agree with nothing enforcing it, and three routes reaching production answering 200 with a
 * payload the frontend could not read.
 *
 * **It makes a failure impossible to miss.** The calls it replaces were inconsistent about it, and
 * three of them were silently wrong:
 *
 *   - `DELETE /api/studio/subgraphs/:id` did not check the response at all and called `onDelete`
 *     regardless, so a failed delete removed the row from the list and the subgraph came back on
 *     the next refresh.
 *   - The per-deployment bounty read did `json.bounties ?? []` with no status check, so a 500
 *     rendered as "no bounties" - absent data reading as an answer.
 *   - The deploy-key read swallowed everything into `.catch(() => {})`.
 *
 * Every call now goes through `studioFetch`, which throws on anything that is not ok, and react-query
 * turns that into an error state a component has to render rather than a value it can ignore.
 */

import { apiUrl } from '@/lib/api-origin';
import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationOptions,
} from '@tanstack/react-query';

import type {
  DeployKeyInfo,
  StudioSession,
  StudioSubgraph,
  SyncBounty,
  UploadedMetadata,
} from './types';

/**
 * One fetch, for every Dock call.
 *
 * `credentials: 'include'` on all of them: the session is an httpOnly cookie, and the calls that
 * omitted it worked only because they happened to be same-origin. That stops being true the moment
 * the edge points these at kittiwake on another host.
 */
export async function studioFetch<T>(url: string, init?: RequestInit): Promise<T> {
  // `credentials: 'include'` was already here and becomes load-bearing rather than defensive once
  // this is cross-origin: the session cookie only travels with it, and the API only accepts it
  // because `Access-Control-Allow-Credentials` is set against an exact origin.
  const res = await fetch(apiUrl(url), { ...init, credentials: 'include' });
  if (!res.ok) {
    // Two envelopes, because these routes are mid-migration. The Next handlers answer
    // `{ error: "<what went wrong>" }`; kittiwake answers `{ error: "<code>", message: "<what went
    // wrong>" }`, where the code is a machine token like `bad_request`. Reading `error` first
    // would show a user the word "bad_request" for every failure the moment a route is proxied,
    // and the Dock's nine all pass through here, so the whole of its error reporting would have
    // gone to codes at cutover with every happy path still working.
    //
    // Anything else is a proxy or a crash, so the status is the fallback rather than `undefined`.
    const body = await res.json().catch(() => null);
    throw new Error(body?.message ?? body?.error ?? `${res.status} ${res.statusText}`);
  }
  // 204 on DELETE has no body to parse.
  if (res.status === 204) return undefined as T;
  return res.json();
}

/**
 * Query keys, in one place.
 *
 * Mutations invalidate by key rather than threading `onCreated`/`onPublished` callbacks up through
 * four levels of props, which is how the page currently keeps two lists of the same bounties in
 * step and occasionally does not.
 */
export const dockKeys = {
  session: ['dock', 'session'] as const,
  subgraphs: ['dock', 'subgraphs'] as const,
  deployKey: ['dock', 'deploy-key'] as const,
  /** Every bounty query regardless of deployment, for invalidating after a write. */
  allBounties: ['dock', 'bounties'] as const,
  bounties: (deployment?: string) => ['dock', 'bounties', deployment ?? 'all'] as const,
};

// ── Session ──────────────────────────────────────────────────────────────────

/** `GET /api/studio/auth`. `address: null` means signed out, which is an answer rather than a gap. */
export function useSession() {
  return useQuery({
    queryKey: dockKeys.session,
    queryFn: () => studioFetch<StudioSession>('/api/studio/auth'),
    staleTime: 60_000,
  });
}

/** `POST /api/studio/auth` — a wallet signature for a session cookie. */
export function useSignIn() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { address: string; message: string; signature: string }) =>
      studioFetch<StudioSession>('/api/studio/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
    onSuccess: (data) => {
      qc.setQueryData(dockKeys.session, data);
      // Everything else in the Dock is scoped to the signed-in address.
      void qc.invalidateQueries({ queryKey: ['dock'] });
    },
  });
}

/** `DELETE /api/studio/auth`. */
export function useSignOut() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => studioFetch<void>('/api/studio/auth', { method: 'DELETE' }),
    onSuccess: () => {
      qc.setQueryData(dockKeys.session, { address: null });
      void qc.invalidateQueries({ queryKey: ['dock'] });
    },
  });
}

// ── Subgraphs ────────────────────────────────────────────────────────────────

/** `GET /api/studio/subgraphs` — the signed-in owner's own. */
export function useMySubgraphs(enabled = true) {
  return useQuery({
    queryKey: dockKeys.subgraphs,
    queryFn: async () =>
      (await studioFetch<{ subgraphs: StudioSubgraph[] }>('/api/studio/subgraphs')).subgraphs,
    enabled,
  });
}

/** `POST /api/studio/subgraphs`. */
export function useCreateSubgraph() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { slug: string; displayName?: string | null }) =>
      studioFetch<{ subgraph: StudioSubgraph }>('/api/studio/subgraphs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: dockKeys.subgraphs }),
  });
}

/**
 * `PATCH /api/studio/subgraphs/:id`.
 *
 * The body is deliberately `Partial<StudioSubgraph>` in wire shape rather than a tidied camelCase
 * one: six call sites send six different subsets, and renaming them here would put a translation
 * layer between the page and the route just as the route is about to change owner.
 */
export function useUpdateSubgraph() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: number; patch: Partial<StudioSubgraph> }) =>
      studioFetch<{ subgraph: StudioSubgraph }>(`/api/studio/subgraphs/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: dockKeys.subgraphs }),
  });
}

/**
 * `DELETE /api/studio/subgraphs/:id`.
 *
 * The call this replaces ignored the response and removed the row from the list regardless, so a
 * failure looked exactly like a success until the page was reloaded.
 */
export function useDeleteSubgraph() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      studioFetch<void>(`/api/studio/subgraphs/${id}`, { method: 'DELETE' }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: dockKeys.subgraphs }),
  });
}

// ── Deploy key ───────────────────────────────────────────────────────────────

/** `GET /api/studio/deploy-key` — whether one exists, never the key itself. */
export function useDeployKey(enabled = true) {
  return useQuery({
    queryKey: dockKeys.deployKey,
    queryFn: () => studioFetch<DeployKeyInfo>('/api/studio/deploy-key'),
    enabled,
  });
}

/**
 * `POST /api/studio/deploy-key` — mint a new one, invalidating any existing key.
 *
 * The response carries the key in clear exactly once and the server keeps only a hash, so the
 * result is handed to the caller rather than written to the cache: a query cache is a thing that
 * gets refetched, and a refetch would replace the only copy with `{ hasKey: true }`.
 */
export function useRotateDeployKey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => studioFetch<DeployKeyInfo>('/api/studio/deploy-key', { method: 'POST' }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: dockKeys.deployKey }),
  });
}

// ── Metadata ─────────────────────────────────────────────────────────────────

/** `POST /api/studio/metadata` — pins to IPFS and returns the bytes32 the publish tx carries. */
export function useUploadMetadata() {
  return useMutation({
    mutationFn: (body: { displayName: string; description?: string; versionLabel?: string }) =>
      studioFetch<UploadedMetadata>('/api/studio/metadata', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
  });
}

// ── Bounties ─────────────────────────────────────────────────────────────────

/**
 * `GET /api/studio/bounties`, optionally for one deployment.
 *
 * The detail modal and the board share this cache, which is the point of the key taking the
 * deployment: they were two separate reads of the same table that could disagree on screen.
 */
export function useBounties(opts?: { deployment?: string; enabled?: boolean }) {
  const deployment = opts?.deployment;
  return useQuery({
    queryKey: dockKeys.bounties(deployment),
    queryFn: async () => {
      const qs = deployment ? `?deployment=${encodeURIComponent(deployment)}` : '';
      return (await studioFetch<{ bounties: SyncBounty[] }>(`/api/studio/bounties${qs}`)).bounties;
    },
    enabled: opts?.enabled ?? true,
    staleTime: 30_000,
  });
}

/** `POST /api/studio/bounties` — records a bounty already posted on chain. */
export function useRecordBounty() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      studioFetch<{ bounty: SyncBounty }>('/api/studio/bounties', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['dock', 'bounties'] }),
  });
}

/**
 * `PATCH /api/studio/bounties/:id` — bookkeeping after an on-chain claim.
 *
 * Deliberately allowed to fail quietly at the call site, and only there: the chain is the source
 * of truth for a claim and this row is a convenience. `useContractStep` reports the throw, so the
 * decision to ignore it is made once, visibly, rather than by a `.catch(() => {})` in an effect.
 */
export function useMarkBountyClaimed(
  options?: Omit<UseMutationOptions<{ bounty: SyncBounty }, Error, number>, 'mutationFn'>,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      studioFetch<{ bounty: SyncBounty }>(`/api/studio/bounties/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'claim' }),
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['dock', 'bounties'] }),
    ...options,
  });
}

// ── Present POI ──────────────────────────────────────────────────────────────

/**
 * `POST /api/indexer/present-poi`.
 *
 * In the long tail rather than the Dock block of the migration, and used only here, which is why
 * it sits in this inventory despite the path.
 */
export function usePresentPoi() {
  return useMutation({
    mutationFn: (body: {
      deploymentId: string;
      allocationId: string;
      agentUrl: string;
      agentToken?: string;
    }) =>
      studioFetch<{ ok: boolean; poi?: string; error?: string }>('/api/indexer/present-poi', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
  });
}
