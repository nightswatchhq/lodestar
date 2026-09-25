import { afterEach, describe, expect, it, vi } from 'vitest';
import { closeGate, closes, cockpitAction } from '../cockpit';
import type { POIDeploymentDetail, POIEpochGroup, POIIndexerEntry } from '../poi';

const ME = '0xAbC0000000000000000000000000000000000001';
const GOOD = '0x' + 'a'.repeat(64);
const BAD = '0x' + 'b'.repeat(64);
const ZERO = '0x' + '0'.repeat(64);

function entry(indexer: string, poi: string, consensusPoi: string): POIIndexerEntry {
  const isZeroPoi = poi === ZERO;
  return { indexer, name: indexer, poi, stake: 1, isZeroPoi, isConsensus: !isZeroPoi && poi === consensusPoi };
}

function epoch(n: number, mine: string | null): POIEpochGroup {
  const indexers = [entry('0xother', GOOD, GOOD)];
  if (mine) indexers.push(entry(ME.toLowerCase(), mine, GOOD));
  return {
    epoch: n,
    consensusPoi: GOOD,
    totalRealStake: 2,
    consensusStake: 1,
    consensusPct: 71,
    realCount: indexers.length,
    zeroCount: 0,
    divergentCount: 0,
    indexers,
  };
}

function detail(...epochs: POIEpochGroup[]): POIDeploymentDetail {
  return { deploymentId: '0xd', ipfsHash: 'Qm', signal: 0, stake: 0, totalAllocations: 0, uniqueIndexers: 0, epochs };
}

describe('closeGate', () => {
  it('refuses when the latest closed POI of this indexer diverged', () => {
    const gate = closeGate(detail(epoch(90, GOOD), epoch(100, BAD)), ME);
    expect(gate).toMatchObject({ kind: 'diverged', epoch: 100, poi: BAD, consensusPoi: GOOD });
  });

  it('clears when the latest one agreed, whatever came before', () => {
    expect(closeGate(detail(epoch(100, GOOD), epoch(90, BAD)), ME)).toEqual({ kind: 'clear', epoch: 100 });
  });

  it('looks past epochs this indexer did not close in, and past zero POIs', () => {
    expect(closeGate(detail(epoch(110, null), epoch(105, ZERO), epoch(100, BAD)), ME)).toMatchObject({
      kind: 'diverged',
      epoch: 100,
    });
  });

  it('has nothing to say without data or without a closed POI from this indexer', () => {
    expect(closeGate(null, ME)).toEqual({ kind: 'no-data' });
    expect(closeGate(detail(epoch(100, null)), ME)).toEqual({ kind: 'no-data' });
  });
});

describe('cockpitAction', () => {
  it('takes the same arguments as the indexer-cli line for each action', () => {
    expect(cockpitAction('unallocate', { deploymentId: 'QmA', allocationId: '0x1' })).toEqual({
      type: 'unallocate',
      deploymentID: 'QmA',
      allocationID: '0x1',
    });
    expect(cockpitAction('reallocate', { deploymentId: 'QmA', allocationId: '0x1', amount: '5000' })).toEqual({
      type: 'reallocate',
      deploymentID: 'QmA',
      allocationID: '0x1',
      amount: '5000',
    });
    expect(cockpitAction('allocate', { deploymentId: 'QmA', allocationId: '0x1', amount: '1.5' })).toEqual({
      type: 'allocate',
      deploymentID: 'QmA',
      amount: '1.5',
    });
  });

  it('refuses a missing argument rather than queueing the wrong action', () => {
    expect(() => cockpitAction('unallocate', { deploymentId: 'QmA' })).toThrow(/allocation ID/);
    expect(() => cockpitAction('reallocate', { deploymentId: 'QmA', allocationId: '0x1' })).toThrow(/GRT/);
    expect(() => cockpitAction('allocate', { deploymentId: 'QmA', amount: '0' })).toThrow(/GRT/);
    expect(() => cockpitAction('allocate', { deploymentId: 'QmA', amount: '1e6' })).toThrow(/GRT/);
    expect(() => cockpitAction('allocate', { deploymentId: ' ', amount: '1' })).toThrow(/deployment/);
  });

  it('counts unallocate and reallocate as closes', () => {
    expect(closes('unallocate')).toBe(true);
    expect(closes('reallocate')).toBe(true);
    expect(closes('allocate')).toBe(false);
  });
});

describe('the client', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('makes no request at all when no Cockpit is configured', async () => {
    vi.stubEnv('NEXT_PUBLIC_COCKPIT_URL', '');
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { fetchActions, COCKPIT_URL } = await import('../cockpit');
    expect(COCKPIT_URL).toBe('');
    await expect(fetchActions()).rejects.toThrow(/No Cockpit/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends credentials to the configured Cockpit and reads a 401 session as signed out', async () => {
    vi.stubEnv('NEXT_PUBLIC_COCKPIT_URL', 'http://localhost:8088/');
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: 'sign in first' }), { status: 401 }));
    vi.stubGlobal('fetch', fetchMock);
    const { fetchCockpitSession } = await import('../cockpit');
    await expect(fetchCockpitSession()).resolves.toBeNull();
    expect(fetchMock).toHaveBeenCalledWith('http://localhost:8088/auth/session', expect.objectContaining({ credentials: 'include' }));
  });

  it('surfaces the Cockpit refusal as the error', async () => {
    vi.stubEnv('NEXT_PUBLIC_COCKPIT_URL', 'http://localhost:8088');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: 'the indexer agent refused: nope' }), { status: 502 }),
    ));
    const { queueActions } = await import('../cockpit');
    await expect(queueActions([{ type: 'allocate', deploymentID: 'QmA', amount: '1' }])).rejects.toThrow(/agent refused: nope/);
  });
});
