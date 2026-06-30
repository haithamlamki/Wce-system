import { describe, expect, it } from 'vitest';
import { parseCsv, pick } from './csv';

describe('parseCsv', () => {
  it('parses simple rows keyed by lower-cased headers', () => {
    expect(parseCsv('Tag,Serial\nV1,SN1')).toEqual([{ tag: 'V1', serial: 'SN1' }]);
  });
  it('handles quoted fields with embedded commas', () => {
    expect(parseCsv('a,b\n"x,y",2')).toEqual([{ a: 'x,y', b: '2' }]);
  });
  it('handles escaped double-quotes', () => {
    expect(parseCsv('a\n"he said ""hi"""')).toEqual([{ a: 'he said "hi"' }]);
  });
  it('skips blank rows and strips a BOM', () => {
    expect(parseCsv('﻿a,b\n1,2\n\n')).toEqual([{ a: '1', b: '2' }]);
  });
});

describe('pick', () => {
  it('returns the first present alias', () => {
    expect(pick({ system: 'Valves' }, 'section', 'system')).toBe('Valves');
    expect(pick({}, 'x', 'y')).toBe('');
  });
});
