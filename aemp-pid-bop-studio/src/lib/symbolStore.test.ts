import { describe, expect, it } from 'vitest';
import { defToRowFields, rowToDef, splitSymbolRows, type SymbolRow } from './symbolStore';
import type { SymbolDef } from './symbols';

const baseRow: SymbolRow = {
  key: 'custom_a', name: 'Widget', cat: 'Custom', w: 40, h: 30,
  color: '#123456', svg: '<rect/>', shapes: null, custom: true, hidden: false,
};

describe('rowToDef', () => {
  it('maps a row to a SymbolDef and preserves the custom flag', () => {
    const def = rowToDef(baseRow);
    expect(def).toMatchObject({ name: 'Widget', cat: 'Custom', w: 40, h: 30, color: '#123456', svg: '<rect/>', custom: true });
    expect(def.shapes).toBeUndefined();
  });
  it('carries shapes through when present', () => {
    const def = rowToDef({ ...baseRow, shapes: [{ type: 'rect', x: 0, y: 0, w: 1, h: 1, stroke: '#000', fill: 'none', sw: 1 }] });
    expect(def.shapes).toHaveLength(1);
  });
});

describe('defToRowFields', () => {
  it('flattens a SymbolDef into row columns with the given flags', () => {
    const def: SymbolDef = { name: 'Gate', cat: 'Valves', w: 50, h: 40, color: '#abc', svg: '<g/>' };
    const row = defToRowFields('gate', def, { custom: false, hidden: false });
    expect(row).toEqual({ key: 'gate', name: 'Gate', cat: 'Valves', w: 50, h: 40, color: '#abc', svg: '<g/>', shapes: null, custom: false, hidden: false });
  });
});

describe('splitSymbolRows', () => {
  it('registers non-hidden rows as defs and collects hidden keys', () => {
    const rows: SymbolRow[] = [
      baseRow,
      { ...baseRow, key: 'gate', name: 'Gate override', custom: false },
      { ...baseRow, key: 'annular', hidden: true },
    ];
    const { defs, hidden } = splitSymbolRows(rows);
    expect(Object.keys(defs).sort()).toEqual(['annular', 'custom_a', 'gate']);
    expect(defs.gate.custom).toBe(false);
    expect(hidden).toEqual(['annular']);
  });
});
