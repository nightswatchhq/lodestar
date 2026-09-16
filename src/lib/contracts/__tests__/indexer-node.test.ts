/**
 * What the page is allowed to say about the indexer's own node. lodestar#238: while kittiwake's
 * first probe is still running every deployment reads `unreachable`, which is a claim about the
 * indexer made out of a request that has not finished.
 */
import { describe, it, expect } from 'vitest';
import { nodeState, formatAge, type IndexerNode } from '../indexer-node';

const node = (over: Partial<IndexerNode> = {}): IndexerNode => ({
  reachable: true,
  checkedAt: 1_789_542_787,
  ageSeconds: 0,
  stale: false,
  lastReachedAt: 1_789_542_787,
  error: null,
  pending: false,
  ...over,
});

describe('what to say about the indexer node', () => {
  it('says nothing at all when the answer carries no node block', () => {
    expect(nodeState(undefined)).toBeNull();
    expect(nodeState(null)).toBeNull();
  });

  it('calls an unfinished first probe checking, not unreachable', () => {
    const s = nodeState(node({ pending: true, reachable: null, checkedAt: null, lastReachedAt: null }));
    expect(s?.kind).toBe('checking');
  });

  it('reports a node that answered, and stays quiet about a fresh result', () => {
    expect(nodeState(node())).toEqual({ kind: 'reachable', note: null });
  });

  it('gives the age of a stale result rather than passing it off as current', () => {
    expect(nodeState(node({ stale: true, ageSeconds: 240 }))).toEqual({
      kind: 'reachable',
      note: 'as of 4m ago',
    });
  });

  /**
   * The age is arithmetic on the payload's own fields: the gap the server measured, plus how long
   * ago it measured it. Nothing here reads the browser's clock, so it cannot drift or mismatch.
   */
  it('says when a node that is down was last reached', () => {
    const s = nodeState(
      node({ reachable: false, pending: false, checkedAt: 1_000_600, lastReachedAt: 1_000_000, ageSeconds: 60 }),
    );
    expect(s).toEqual({ kind: 'unreachable', note: 'last reached 11m ago' });
  });

  it('does not invent a last-reached time for a node that never answered', () => {
    const s = nodeState(node({ reachable: false, lastReachedAt: null }));
    expect(s).toEqual({ kind: 'unreachable', note: 'never reached' });
  });

  it('treats an answer that says neither as still checking', () => {
    expect(nodeState(node({ reachable: null, pending: false }))?.kind).toBe('checking');
  });
});

describe('ages in words', () => {
  it('climbs through the units', () => {
    expect(formatAge(0)).toBe('0s');
    expect(formatAge(89)).toBe('89s');
    expect(formatAge(90)).toBe('2m');
    expect(formatAge(5_340)).toBe('89m');
    expect(formatAge(5_400)).toBe('2h');
    expect(formatAge(7_200)).toBe('2h');
    expect(formatAge(172_800 + 3_600)).toBe('2d');
  });

  it('never reports a negative age from a clock that ran backwards', () => {
    expect(formatAge(-30)).toBe('0s');
  });
});
