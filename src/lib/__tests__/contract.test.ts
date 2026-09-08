import { describe, it, expect } from 'vitest';
import { parseResponse } from '../contract';

describe('parseResponse: the envelope', () => {
  it('rejects a non-object body and says what arrived', () => {
    expect(() => parseResponse('/api/x', 'nope')).toThrow(/response was string/);
    expect(() => parseResponse('/api/x', null)).toThrow(/response was null/);
  });

  it('returns the whole body when nothing is picked', () => {
    const body = { tvl: 1 };
    expect(parseResponse('/api/tvl', body, { present: ['tvl'] })).toBe(body);
  });

  it('returns the picked path', () => {
    expect(parseResponse('/api/x', { data: { a: 1 } }, { pick: 'data' })).toEqual({ a: 1 });
  });

  it('throws when the picked path is absent', () => {
    expect(() => parseResponse('/api/x', { other: 1 }, { pick: 'data' })).toThrow(
      /expected a value at "data".*Top-level keys: other/s,
    );
  });
});

describe('parseResponse: presence is not fullness', () => {
  // The first run of the e2e contracts rejected empty results and produced four false alarms. A
  // parser that did the same would break working pages, so every one of these is a pass.
  it('accepts an empty array', () => {
    expect(parseResponse('/api/x', { history: [] }, { arrays: ['history'] })).toEqual({ history: [] });
  });

  it('accepts an empty object', () => {
    expect(parseResponse('/api/x', { data: {} }, { objects: ['data'] })).toEqual({ data: {} });
  });

  it('accepts null as present, because the backend sent it on purpose', () => {
    expect(parseResponse('/api/x', { delegator: null }, { present: ['delegator'] })).toEqual({
      delegator: null,
    });
  });

  it('skips the row check on an empty collection', () => {
    expect(parseResponse('/api/x', { rows: [] }, { rows: { rows: ['id'] } })).toEqual({ rows: [] });
  });
});

describe('parseResponse: throws loudly, naming what arrived', () => {
  it('names the keys received when a required path is absent', () => {
    expect(() => parseResponse('/api/x', { alpha: 1, beta: 2 }, { present: ['gamma'] })).toThrow(
      /expected a value at "gamma", got nothing \(the key is absent\)\. Top-level keys: alpha, beta/,
    );
  });

  it('distinguishes an array from an object', () => {
    expect(() => parseResponse('/api/x', { data: [] }, { objects: ['data'] })).toThrow(
      /expected an object at "data", got an array of 0/,
    );
    expect(() => parseResponse('/api/x', { data: {} }, { arrays: ['data'] })).toThrow(
      /expected an array at "data", got an empty object/,
    );
  });

  it('names the missing row keys and the keys the row does have', () => {
    expect(() =>
      parseResponse('/api/x', { data: [{ address: '0x1' }] }, { rows: { data: ['id'] } }),
    ).toThrow(/rows in "data" are missing id - the row has an object with keys: address/);
  });

  it('points at the file and the issue, so the next reader has somewhere to go', () => {
    expect(() => parseResponse('/api/x', {}, { present: ['a'] })).toThrow(
      /see src\/lib\/contract\.ts and #124/,
    );
  });

  it('does not treat a nested miss as a top-level one', () => {
    expect(() =>
      parseResponse('/api/x', { data: { graphNetwork: {} } }, {
        present: ['data.graphNetwork.currentEpoch'],
      }),
    ).toThrow(/expected a value at "data\.graphNetwork\.currentEpoch"/);
  });
});

describe('parseResponse: the #114 shape change', () => {
  // `/api/indexers-enriched` moved to kittiwake and changed from `{ indexers, computedAt }` to
  // `{ data: [...] }` with every field renamed. The route answered 200 with a hundred healthy rows
  // and the build stayed green, so the directory rendered a dash in every column for a day. Under
  // the old envelope's contract, the new payload now fails at the first check.
  const kittiwake = {
    data: [{ address: '0x1', selfStakeGrt: '1', delegatorApr: '2', scoreGrade: 'A' }],
  };

  it('refuses the renamed envelope instead of rendering dashes', () => {
    expect(() =>
      parseResponse('/api/indexers-enriched', kittiwake, {
        rows: { indexers: ['id', 'selfStakeGRT', 'delegatorAPR'] },
      }),
    ).toThrow(/expected an array at "indexers", got nothing.*Top-level keys: data/s);
  });

  it('refuses renamed fields even when the envelope survives', () => {
    expect(() =>
      parseResponse('/api/indexers-enriched', { indexers: kittiwake.data }, {
        rows: { indexers: ['id', 'selfStakeGRT', 'delegatorAPR'] },
      }),
    ).toThrow(/missing id, selfStakeGRT, delegatorAPR/);
  });
});
