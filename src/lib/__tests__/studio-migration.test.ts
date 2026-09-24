import { describe, expect, it } from 'vitest';
import type { DirectoryRow } from '../api';
import { directoryApiQuery, isUnallocated, toggleUnallocated, emptyDirectoryState } from '../subgraph-directory';
import {
  MIGRATION_NETWORKS,
  REO_SIGNAL_FLOOR_GRT,
  latestSignalChange,
  migrationRow,
  migrationStarted,
  migrationState,
  parseNetworks,
  signalAgeLabel,
  sortBySignalAge,
} from '../studio-migration';

const GRT = 10n ** 18n;

function dep(ipfsHash: string, signalGrt: number, network: string | null = 'bsc'): DirectoryRow {
  return {
    id: `0x${ipfsHash}`,
    ipfsHash,
    displayName: null,
    categories: [],
    signalledTokens: (BigInt(signalGrt) * GRT).toString(),
    stakedTokens: '0',
    queryFeesAmount: '0',
    queryFees30d: '0',
    createdAt: 1_700_000_000,
    indexerCount: 0,
    curatorCount: 1,
    network,
    complexity: null,
  };
}

describe('the unallocated toggle', () => {
  it('is two bounds, so it composes with a network and survives a link', () => {
    const on = toggleUnallocated({ ...emptyDirectoryState(), network: 'bsc' });
    expect(isUnallocated(on)).toBe(true);
    expect(on.network).toBe('bsc');
    const q = new URLSearchParams(directoryApiQuery(on));
    expect(q.get('indexersMax')).toBe('0');
    expect(q.get('signalMin')).toBe('1');
    expect(q.get('network')).toBe('bsc');
    expect(q.get('sort')).toBe('signal');
  });

  it('comes off again and leaves the other filters alone', () => {
    const on = toggleUnallocated({ ...emptyDirectoryState(), complexity: 'Heavy' });
    const off = toggleUnallocated(on);
    expect(isUnallocated(off)).toBe(false);
    expect(off.complexity).toBe('Heavy');
    expect(off.ranges.indexers).toEqual({ min: null, max: null });
    expect(off.ranges.signal).toEqual({ min: null, max: null });
  });

  it('is not on for a signal floor alone, nor for an indexer cap with no signal', () => {
    const s = emptyDirectoryState();
    expect(isUnallocated({ ...s, ranges: { ...s.ranges, signal: { min: 200, max: null } } })).toBe(false);
    expect(isUnallocated({ ...s, ranges: { ...s.ranges, indexers: { min: null, max: 0 } } })).toBe(false);
  });
});

describe('the networks in the URL', () => {
  it('defaults to the two chains the Foundation named', () => {
    expect(parseNetworks(null)).toEqual([...MIGRATION_NETWORKS]);
    expect(parseNetworks('')).toEqual(['bsc', 'matic']);
  });

  it('takes a comma list, once each, and drops what is not a manifest name', () => {
    expect(parseNetworks('arbitrum-one, mainnet,arbitrum-one')).toEqual(['arbitrum-one', 'mainnet']);
    expect(parseNetworks('bsc,<script>')).toEqual(['bsc']);
  });

  it('asks the directory for one network, signalled and unallocated', () => {
    const q = new URLSearchParams(directoryApiQuery(migrationState('matic')));
    expect(q.get('network')).toBe('matic');
    expect(q.get('indexersMax')).toBe('0');
  });
});

describe('signal age', () => {
  it('is the latest change across curators, and null with none', () => {
    expect(latestSignalChange([{ lastSignalChange: 5 }, { lastSignalChange: 9 }, { lastSignalChange: 0 }])).toBe(9);
    expect(latestSignalChange([])).toBeNull();
    expect(latestSignalChange([{ lastSignalChange: 0 }])).toBeNull();
  });

  it('labels whole days', () => {
    const now = 1_760_000_000_000;
    expect(signalAgeLabel(now / 1000 - 3600, now)).toBe('today');
    expect(signalAgeLabel(now / 1000 - 86_400, now)).toBe('1 day ago');
    expect(signalAgeLabel(now / 1000 - 4 * 86_400 - 10, now)).toBe('4 days ago');
  });

  it('sorts newest signal first, unread rows after, and by signal within each', () => {
    const rows = [
      migrationRow(dep('a', 100), 10),
      migrationRow(dep('b', 900), null),
      migrationRow(dep('c', 100), 50),
      migrationRow(dep('d', 300), null),
    ];
    expect(sortBySignalAge(rows).map((r) => r.ipfsHash)).toEqual(['c', 'a', 'b', 'd']);
  });
});

describe('a migration row', () => {
  it('marks signal under the REO floor', () => {
    expect(migrationRow(dep('a', REO_SIGNAL_FLOOR_GRT - 1), null).belowReoFloor).toBe(true);
    expect(migrationRow(dep('a', REO_SIGNAL_FLOOR_GRT), null).belowReoFloor).toBe(false);
  });

  it('knows whether 8 October has come', () => {
    expect(migrationStarted(Date.UTC(2026, 9, 7, 23))).toBe(false);
    expect(migrationStarted(Date.UTC(2026, 9, 8))).toBe(true);
  });
});
