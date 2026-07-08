// ============================================================================
//  Global Symbol library store (Supabase, migration 0009).
//  The company-wide catalog: custom symbols, built-in overrides, and hidden
//  markers, shared across every rig/drawing. Pure mappers convert between DB
//  rows and the SymbolDef the SYM registry uses. All async calls no-op / return
//  empty when Supabase isn't configured, so the app still works offline.
// ============================================================================
import { supabase } from './supabase';
import type { DrawShape, SymbolDef } from './symbols';

export interface SymbolRow {
  key: string;
  name: string;
  cat: string;
  w: number;
  h: number;
  color: string;
  svg: string;
  shapes: DrawShape[] | null;
  custom: boolean;
  hidden: boolean;
}

/** DB row → SymbolDef (drops null shapes; preserves the custom flag). */
export function rowToDef(row: SymbolRow): SymbolDef {
  const def: SymbolDef = { name: row.name, cat: row.cat, w: row.w, h: row.h, color: row.color, svg: row.svg, custom: row.custom };
  if (row.shapes && row.shapes.length) def.shapes = row.shapes;
  return def;
}

/** SymbolDef → flat row columns for insert/upsert. */
export function defToRowFields(key: string, def: SymbolDef, opts: { custom: boolean; hidden: boolean }): SymbolRow {
  return {
    key,
    name: def.name,
    cat: def.cat,
    w: def.w,
    h: def.h,
    color: def.color,
    svg: def.svg,
    shapes: def.shapes ?? null,
    custom: opts.custom,
    hidden: opts.hidden,
  };
}

/** Split fetched rows into a SymbolDef map (to merge into SYM) + hidden keys. */
export function splitSymbolRows(rows: SymbolRow[]): { defs: Record<string, SymbolDef>; hidden: string[] } {
  const defs: Record<string, SymbolDef> = {};
  const hidden: string[] = [];
  for (const row of rows) {
    defs[row.key] = rowToDef(row);
    if (row.hidden) hidden.push(row.key);
  }
  return { defs, hidden };
}

/** Fetch the whole global library. [] when Supabase isn't configured. */
export async function listSymbols(): Promise<SymbolRow[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.from('symbols').select('key, name, cat, w, h, color, svg, shapes, custom, hidden');
  if (error) throw new Error(error.message);
  return (data as SymbolRow[]) ?? [];
}

/** Upsert one symbol (new custom or built-in override). No-op when offline. */
export async function upsertSymbol(key: string, def: SymbolDef, opts: { custom: boolean; hidden: boolean }): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.from('symbols').upsert(defToRowFields(key, def, opts));
  if (error) throw new Error(error.message);
}

/** Delete a symbol row (used when a custom symbol is deleted). No-op offline. */
export async function deleteSymbolRow(key: string): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.from('symbols').delete().eq('key', key);
  if (error) throw new Error(error.message);
}

/** Persist a hide/restore. Stores the current def so restore leaves art intact. */
export async function setSymbolHidden(key: string, def: SymbolDef, hidden: boolean): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.from('symbols').upsert(defToRowFields(key, def, { custom: def.custom ?? false, hidden }));
  if (error) throw new Error(error.message);
}
