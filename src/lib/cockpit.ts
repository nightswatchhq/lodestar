/**
 * The client for `lodestar-cockpit`, the small binary an indexer runs beside its own agent.
 *
 * Only a self-hosted build sets `NEXT_PUBLIC_COCKPIT_URL`. On the hosted site it is empty and
 * nothing in this module is ever called, so lodestar-dashboard.com never talks to an agent.
 */

import { parseResponse } from './contract';
import type { POIDeploymentDetail } from './poi';

export const COCKPIT_URL = (process.env.NEXT_PUBLIC_COCKPIT_URL?.trim() ?? '').replace(/\/+$/, '');

export type CockpitActionType = 'allocate' | 'unallocate' | 'reallocate';

export type ActionStatus =
  | 'queued' | 'approved' | 'deploying' | 'pending' | 'success' | 'failed' | 'canceled';

export interface QueueAction {
  type: CockpitActionType;
  deploymentID: string;
  allocationID?: string;
  amount?: string;
  reason?: string;
}

export interface AgentAction {
  id: number;
  type: string;
  status: ActionStatus;
  deploymentID: string | null;
  allocationID: string | null;
  amount: string | null;
  source: string;
  reason: string;
  priority: number;
  transaction?: string | null;
  failureReason?: string | null;
  protocolNetwork: string;
}

export interface CockpitSession {
  indexer: string;
  signer: string;
  expiresAt: number;
}

export interface Challenge {
  nonce: string;
  message: string;
  expiresAt: number;
  indexer: string;
}

export class CockpitError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

async function cockpit(path: string, init?: { method?: 'GET' | 'POST'; body?: unknown }): Promise<unknown> {
  if (!COCKPIT_URL) throw new CockpitError('No Cockpit is configured for this build', 0);
  const response = await fetch(`${COCKPIT_URL}${path}`, {
    method: init?.method ?? 'GET',
    credentials: 'include',
    headers: init?.body !== undefined ? { 'content-type': 'application/json' } : undefined,
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  if (response.status === 204) return null;
  const json: unknown = await response.json().catch((e: unknown) => {
    throw new CockpitError(`The Cockpit answered ${response.status} with no JSON: ${String(e)}`, response.status);
  });
  if (!response.ok) {
    const msg = (json as { error?: unknown })?.error;
    throw new CockpitError(typeof msg === 'string' ? msg : `HTTP ${response.status}`, response.status);
  }
  return json;
}

/** The current session, or `null` when signed out. Any other failure throws. */
export async function fetchCockpitSession(): Promise<CockpitSession | null> {
  try {
    const body = await cockpit('/auth/session');
    return parseResponse('/auth/session', body, { present: ['indexer', 'signer', 'expiresAt'] });
  } catch (e) {
    if (e instanceof CockpitError && e.status === 401) return null;
    throw e;
  }
}

export async function requestChallenge(address: string): Promise<Challenge> {
  const body = await cockpit('/auth/challenge', { method: 'POST', body: { address } });
  return parseResponse('/auth/challenge', body, { present: ['nonce', 'message', 'indexer'] });
}

export async function verifySignature(nonce: string, signature: string): Promise<CockpitSession> {
  const body = await cockpit('/auth/verify', { method: 'POST', body: { nonce, signature } });
  return parseResponse('/auth/verify', body, { present: ['indexer', 'signer', 'expiresAt'] });
}

export async function signOutOfCockpit(): Promise<void> {
  await cockpit('/auth/logout', { method: 'POST', body: {} });
}

export async function fetchActions(status?: ActionStatus): Promise<AgentAction[]> {
  const qs = status ? `?status=${encodeURIComponent(status)}` : '';
  const body = await cockpit(`/actions${qs}`);
  return parseResponse('/actions', body, { arrays: ['actions'], pick: 'actions' });
}

export async function queueActions(actions: QueueAction[]): Promise<AgentAction[]> {
  const body = await cockpit('/actions', { method: 'POST', body: { actions } });
  return parseResponse('/actions', body, { arrays: ['actions'], pick: 'actions' });
}

export async function approveActions(ids: number[]): Promise<AgentAction[]> {
  const body = await cockpit('/actions/approve', { method: 'POST', body: { ids } });
  return parseResponse('/actions/approve', body, { arrays: ['actions'], pick: 'actions' });
}

export async function cancelActions(ids: number[]): Promise<AgentAction[]> {
  const body = await cockpit('/actions/cancel', { method: 'POST', body: { ids } });
  return parseResponse('/actions/cancel', body, { arrays: ['actions'], pick: 'actions' });
}

/**
 * The same actions `queueCommand` writes as indexer-cli lines, as the agent's queue takes them.
 * Amounts are GRT. Throws on a missing argument rather than queueing the wrong action.
 */
export function cockpitAction(
  type: CockpitActionType,
  opts: { deploymentId: string; allocationId?: string; amount?: string; reason?: string },
): QueueAction {
  const action: QueueAction = { type, deploymentID: opts.deploymentId.trim() };
  if (!action.deploymentID) throw new Error(`${type} needs a deployment`);
  if (type !== 'allocate') {
    if (!opts.allocationId?.trim()) throw new Error(`${type} needs an allocation ID`);
    action.allocationID = opts.allocationId.trim();
  }
  if (type !== 'unallocate') {
    const amount = opts.amount?.trim();
    if (!amount || !/^\d+(\.\d+)?$/.test(amount) || Number(amount) <= 0) {
      throw new Error(`${type} needs a positive amount in GRT`);
    }
    action.amount = amount;
  }
  if (opts.reason?.trim()) action.reason = opts.reason.trim();
  return action;
}

export type CloseGate =
  | { kind: 'clear'; epoch: number }
  | { kind: 'no-data' }
  | { kind: 'diverged'; epoch: number; consensusPct: number; poi: string; consensusPoi: string | null };

/**
 * Whether this indexer's latest closed POI on the deployment agreed with stake-weighted consensus.
 *
 * It looks backwards: the POI a new close will submit does not exist until the agent computes it,
 * so a divergence already on record is the evidence there is. A zero POI is a close without a
 * proof and says nothing either way.
 */
export function closeGate(detail: POIDeploymentDetail | null, indexer: string): CloseGate {
  if (!detail) return { kind: 'no-data' };
  const me = indexer.toLowerCase();
  const epochs = [...detail.epochs].sort((a, b) => b.epoch - a.epoch);
  for (const group of epochs) {
    const mine = group.indexers.find((i) => i.indexer.toLowerCase() === me && !i.isZeroPoi);
    if (!mine) continue;
    return mine.isConsensus
      ? { kind: 'clear', epoch: group.epoch }
      : {
          kind: 'diverged',
          epoch: group.epoch,
          consensusPct: group.consensusPct,
          poi: mine.poi,
          consensusPoi: group.consensusPoi,
        };
  }
  return { kind: 'no-data' };
}

/** A close is any action that ends an allocation. */
export function closes(type: CockpitActionType): boolean {
  return type === 'unallocate' || type === 'reallocate';
}
