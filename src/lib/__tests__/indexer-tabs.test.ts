import { describe, it, expect } from 'vitest';
import { parseIndexerTab, INDEXER_TABS } from '../indexer-tabs';

const INDEXER = '0xAAAAaaaaAAAA';
const OPERATOR = '0xBBBBbbbbBBBB';

describe('parseIndexerTab', () => {
  it('honours a known tab from the URL, even for an operator', () => {
    expect(parseIndexerTab('history', {
      connected: OPERATOR,
      indexerId: INDEXER,
      operatorIds: [OPERATOR],
    })).toBe('history');
  });

  it('ignores an unknown tab rather than inventing one', () => {
    expect(parseIndexerTab('nope', { indexerId: INDEXER })).toBe('overview');
  });

  it('defaults to overview for a visitor with no wallet', () => {
    expect(parseIndexerTab(null, { indexerId: INDEXER, operatorIds: [OPERATOR] })).toBe('overview');
  });

  it('defaults to allocations when the connected wallet is the indexer', () => {
    expect(parseIndexerTab(null, { connected: INDEXER, indexerId: INDEXER })).toBe('allocations');
  });

  it('defaults to allocations when the connected wallet is an operator', () => {
    expect(parseIndexerTab(null, {
      connected: OPERATOR,
      indexerId: INDEXER,
      operatorIds: [OPERATOR],
    })).toBe('allocations');
  });

  it('does not treat a missing operator list as a reason to open allocations', () => {
    expect(parseIndexerTab(null, {
      connected: OPERATOR,
      indexerId: INDEXER,
    })).toBe('overview');
  });

  it('lists every tab the page renders', () => {
    expect([...INDEXER_TABS]).toEqual([
      'overview', 'allocations', 'plan', 'rewards', 'provisions', 'performance', 'delegators', 'history',
    ]);
  });
});
