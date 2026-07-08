import { describe, expect, it } from 'vitest';
import { sanitizeSvg } from './sanitizeSvg';
import { defToRowFields, mergeLibraryRows, rowToDef, type SymbolRow } from './symbolStore';
import type { SymbolDef } from './symbols';

const baseRow: SymbolRow = {
  key: 'custom_a', name: 'Widget', cat: 'Custom', w: 40, h: 30,
  color: '#123456', svg: '<rect/>', shapes: null, custom: true, hidden: false,
};

describe('rowToDef', () => {
  it('maps a row to a SymbolDef and preserves the custom flag', () => {
    const def = rowToDef(baseRow);
    // svg is sanitized on ingest (F1) — content is unchanged, DOMPurify just
    // normalises self-closing tags (`<rect/>`) to explicit ones (`<rect></rect>`).
    expect(def).toMatchObject({ name: 'Widget', cat: 'Custom', w: 40, h: 30, color: '#123456', svg: sanitizeSvg('<rect/>'), custom: true });
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

describe('mergeLibraryRows', () => {
  it('merges every row and collects hidden keys, preserving the custom flag', () => {
    const rows: SymbolRow[] = [
      baseRow,
      { ...baseRow, key: 'gate', name: 'Gate override', custom: false },
      { ...baseRow, key: 'annular', hidden: true },
    ];
    const { merged, hidden } = mergeLibraryRows({}, rows);
    expect(Object.keys(merged).sort()).toEqual(['annular', 'custom_a', 'gate']);
    expect(merged.gate.custom).toBe(false);
    expect(hidden).toEqual(['annular']);
  });

  it('preserves built-in-only fields (bopHeight/defaults) when merging an override', () => {
    const existing: Record<string, SymbolDef> = {
      annular: { name: 'Annular BOP', cat: 'BOP Stack', w: 84, h: 60, color: '#cf3a30', svg: '<orig/>', bopHeight: 1.5, defaults: { size: '13-5/8"' } },
    };
    const rows: SymbolRow[] = [{ ...baseRow, key: 'annular', name: 'Annular BOP', cat: 'BOP Stack', svg: '<circle/>', custom: false }];
    const { merged } = mergeLibraryRows(existing, rows);
    expect(merged.annular.svg).toBe(sanitizeSvg('<circle/>'));  // edited art applied (sanitized on ingest)
    expect(merged.annular.bopHeight).toBe(1.5);          // built-in field survives
    expect(merged.annular.defaults).toEqual({ size: '13-5/8"' });
  });

  it('still merges a hidden row so an edited-then-hidden built-in keeps its art (restore recovers it)', () => {
    const existing: Record<string, SymbolDef> = {
      gate: { name: 'Gate Valve', cat: 'Valves', w: 50, h: 40, color: '#abc', svg: '<orig/>' },
    };
    const rows: SymbolRow[] = [{ ...baseRow, key: 'gate', name: 'Gate Valve', cat: 'Valves', svg: '<circle/>', custom: false, hidden: true }];
    const { merged, hidden } = mergeLibraryRows(existing, rows);
    expect(hidden).toEqual(['gate']);
    expect(merged.gate.svg).toBe(sanitizeSvg('<circle/>'));  // art retained despite hidden (sanitized)
  });
});
