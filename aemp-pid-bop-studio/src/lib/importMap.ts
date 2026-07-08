// ============================================================================
//  Equipment-import column mapping (research report §5). Pure helpers shared by
//  the import dialog and unit tests: auto-detect header→field mapping and apply
//  a chosen mapping to parsed rows. Format-agnostic (CSV or XLSX rows).
// ============================================================================
import type { Component } from '../types';
import { SYM, type SymbolKey } from './symbols';

export type FieldKey =
  | 'tag' | 'type' | 'section' | 'description' | 'rwp' | 'size'
  | 'manufacturer' | 'serial' | 'int_last' | 'int_due' | 'maj_last' | 'maj_due';

export interface ImportField {
  key: FieldKey;
  label: string;
  aliases: string[]; // lower-cased header names that map to this field
}

/** Target fields with the header aliases the auto-mapper recognises. */
export const IMPORT_FIELDS: ImportField[] = [
  { key: 'tag', label: 'Tag', aliases: ['tag', 'item', 'id'] },
  { key: 'type', label: 'Symbol type', aliases: ['type', 'symbol'] },
  { key: 'section', label: 'System', aliases: ['system', 'section'] },
  { key: 'description', label: 'Description', aliases: ['description', 'desc'] },
  { key: 'rwp', label: 'RWP', aliases: ['rwp', 'rating', 'wp'] },
  { key: 'size', label: 'Size', aliases: ['size', 'bore'] },
  { key: 'manufacturer', label: 'Manufacturer', aliases: ['manufacturer', 'mfr', 'make'] },
  { key: 'serial', label: 'Serial', aliases: ['serial', 'sn', 's/n'] },
  { key: 'int_last', label: 'Interm. last', aliases: ['int_last', 'intermediate last', 'int last'] },
  { key: 'int_due', label: 'Interm. due', aliases: ['int_due', 'intermediate due', 'int due'] },
  { key: 'maj_last', label: 'Major last', aliases: ['maj_last', 'major last'] },
  { key: 'maj_due', label: 'Major due', aliases: ['maj_due', 'major due'] },
];

export type ColumnMap = Partial<Record<FieldKey, string>>;
export type MappedRow = Partial<Component> & { type?: SymbolKey };

/** Shared row cap for untrusted-file import parsers (xlsx.ts, layoutImport.ts, here). */
export const MAX_IMPORT_ROWS = 10000;

/** Best-guess header→field map from the file's headers (first alias hit wins). */
export function autoMap(headers: string[]): ColumnMap {
  const set = new Set(headers.map((h) => h.trim().toLowerCase()));
  const map: ColumnMap = {};
  for (const f of IMPORT_FIELDS) {
    const hit = f.aliases.find((a) => set.has(a));
    if (hit) map[f.key] = hit;
  }
  return map;
}

/** Apply a column map to parsed rows, dropping rows with no usable content. */
export function applyMap(rows: Record<string, string>[], map: ColumnMap): MappedRow[] {
  if (rows.length > MAX_IMPORT_ROWS) throw new Error(`Too many rows to import (max ${MAX_IMPORT_ROWS}).`);
  return rows
    .map((r): MappedRow => {
      const v = (k: FieldKey) => { const h = map[k]; return h ? (r[h] ?? '').trim() : ''; };
      const typeRaw = v('type').toLowerCase();
      return {
        type: typeRaw && typeRaw in SYM ? (typeRaw as SymbolKey) : undefined,
        tag: v('tag'),
        section: v('section') || undefined,
        description: v('description') || undefined,
        rwp: v('rwp'),
        size: v('size'),
        manufacturer: v('manufacturer'),
        serial: v('serial'),
        int_last: v('int_last'),
        int_due: v('int_due'),
        maj_last: v('maj_last'),
        maj_due: v('maj_due'),
      };
    })
    .filter((r) => r.tag || r.type || r.serial || r.description);
}
