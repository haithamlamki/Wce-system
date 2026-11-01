import { describe, expect, it } from 'vitest';
import { cleanSpec, findValue, moveItem, normalizeSpec, SPEC_TEMPLATE, validateSpec } from './unitSpecs';

describe('normalizeSpec', () => {
  it('returns an empty sheet for junk input', () => {
    expect(normalizeSpec(null)).toEqual({ sections: [] });
    expect(normalizeSpec({ sections: 'x' })).toEqual({ sections: [] });
  });

  it('coerces missing fields to strings', () => {
    expect(normalizeSpec({ sections: [{ title: 'Mast', rows: [{ label: 'Height' }, null] }, {}] })).toEqual({
      sections: [
        { title: 'Mast', rows: [{ label: 'Height', value: '' }, { label: '', value: '' }] },
        { title: '', rows: [] },
      ],
    });
  });
});

describe('cleanSpec', () => {
  it('trims text and drops blank rows and empty untitled sections', () => {
    const out = cleanSpec({
      sections: [
        { title: ' Mast ', rows: [{ label: ' Height ', value: ' 43 m  \n 2nd line  ' }, { label: ' ', value: '' }] },
        { title: '  ', rows: [{ label: '', value: '' }] },
        { title: 'Power Slip', rows: [] },
      ],
    });
    expect(out).toEqual({
      sections: [
        { title: 'Mast', rows: [{ label: 'Height', value: '43 m\n 2nd line' }] },
        { title: 'Power Slip', rows: [] },
      ],
    });
  });
});

describe('validateSpec', () => {
  it('accepts the template', () => {
    expect(validateSpec(SPEC_TEMPLATE)).toEqual([]);
  });

  it('flags untitled sections and oversized text', () => {
    const errs = validateSpec({
      sections: [{ title: '', rows: [{ label: 'x'.repeat(121), value: 'v'.repeat(1001) }] }],
    });
    expect(errs).toHaveLength(3);
  });
});

describe('findValue', () => {
  const spec = {
    sections: [
      { title: 'A', rows: [{ label: 'HP Rating', value: '' }] },
      { title: 'B', rows: [{ label: 'hp rating', value: '1000 HP' }, { label: 'Rig Model', value: 'ZJ 40' }] },
    ],
  };
  it('matches labels case-insensitively and skips empty values', () => {
    expect(findValue(spec, ['HP Rating'])).toBe('1000 HP');
    expect(findValue(spec, ['Nope', 'Rig Model'])).toBe('ZJ 40');
    expect(findValue(spec, ['Missing'])).toBe('');
  });
});

describe('moveItem', () => {
  it('moves within bounds and ignores edge moves', () => {
    expect(moveItem(['a', 'b', 'c'], 0, 1)).toEqual(['b', 'a', 'c']);
    expect(moveItem(['a', 'b', 'c'], 2, -2)).toEqual(['c', 'a', 'b']);
    expect(moveItem(['a', 'b'], 0, -1)).toEqual(['a', 'b']);
  });
});
