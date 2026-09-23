import { describe, expect, it } from 'vitest';
import { csvCell, csvFilename, toCsv, weiToGRTExact } from '../csv';

describe('csvCell', () => {
  it('leaves plain values alone and empties the absent ones', () => {
    expect(csvCell('0xedca8740873152ff30a2696add66d1ab41882beb')).toBe('0xedca8740873152ff30a2696add66d1ab41882beb');
    expect(csvCell(12.5)).toBe('12.5');
    expect(csvCell(-3)).toBe('-3');
    expect(csvCell(null)).toBe('');
    expect(csvCell(undefined)).toBe('');
    expect(csvCell(Number.NaN)).toBe('');
    expect(csvCell(true)).toBe('true');
  });

  it('quotes a comma, a quote or a line break, doubling the quotes', () => {
    expect(csvCell('Pinax, Inc.')).toBe('"Pinax, Inc."');
    expect(csvCell('the "best" indexer')).toBe('"the ""best"" indexer"');
    expect(csvCell('two\nlines')).toBe('"two\nlines"');
    expect(csvCell(' padded ')).toBe('" padded "');
  });

  it('defuses text a spreadsheet would run as a formula, but not a negative number', () => {
    expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvCell('+1')).toBe("'+1");
    expect(csvCell('@sum')).toBe("'@sum");
    expect(csvCell('-cmd')).toBe("'-cmd");
    expect(csvCell('-12.50')).toBe('-12.50');
  });
});

describe('toCsv', () => {
  it('keeps every row the width of the header whatever the names hold', () => {
    const csv = toCsv(['name', 'stake'], [['a, b', 1], ['c', null]]);
    expect(csv).toBe('name,stake\n"a, b",1\nc,');
  });
});

describe('weiToGRTExact', () => {
  it('is exact where a float is not', () => {
    expect(weiToGRTExact('15026774210888241452143253')).toBe('15026774.210888241452143253');
    expect(weiToGRTExact('1000000000000000000')).toBe('1');
    expect(weiToGRTExact('1')).toBe('0.000000000000000001');
    expect(weiToGRTExact('0')).toBe('0');
    expect(weiToGRTExact('-2500000000000000000')).toBe('-2.5');
  });

  it('writes nothing for nothing, or for something that is not an amount', () => {
    expect(weiToGRTExact(null)).toBe('');
    expect(weiToGRTExact('')).toBe('');
    expect(weiToGRTExact('lots')).toBe('');
  });
});

describe('csvFilename', () => {
  it('adds the extension once', () => {
    expect(csvFilename('foghorn-qos-24h')).toBe('foghorn-qos-24h.csv');
    expect(csvFilename('foghorn-qos-24h.csv')).toBe('foghorn-qos-24h.csv');
  });
});
