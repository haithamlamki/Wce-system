// ============================================================================
//  Global Symbol library store (Supabase, migration 0009).
//  The company-wide catalog: custom symbols, built-in overrides, and hidden
//  markers, shared across every rig/drawing. Pure mappers convert between DB
//  rows and the SymbolDef the SYM registry uses. All async calls no-op / return
//  empty when Supabase isn't configured, so the app still works offline.
// ============================================================================
import { supabase } from './supabase';
import { sanitizeSvg } from './sanitizeSvg';
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

/** DB row → SymbolDef (drops null shapes; preserves the custom flag).
 *  Sanitizes `svg` on ingest — a global library row may have been authored by
 *  any admin/user, so the stored SYM registry never holds unsanitized art. */
export function rowToDef(row: SymbolRow): SymbolDef {
  const def: SymbolDef = { name: row.name, cat: row.cat, w: row.w, h: row.h, color: row.color, svg: sanitizeSvg(row.svg), custom: row.custom };
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

/**
 * Merge fetched/cached library rows onto the existing SYM registry snapshot.
 * Returns the new registry entries to apply plus the hidden keys.
 *
 * Every row — including hidden ones — is merged, so an edited-then-hidden
 * built-in keeps its art in SYM; `restoreSymbol` reads that art back from SYM,
 * so restore no longer reverts to the stock built-in (bug: edit → hide →
 * reload → restore). The spread `{ ...existing[key], ...def }` preserves
 * built-in-only fields (bopHeight/defaults) that have no DB columns. Hidden
 * keys are returned separately to drive library/palette visibility.
 */
export function mergeLibraryRows(
  existing: Record<string, SymbolDef>,
  rows: SymbolRow[],
): { merged: Record<string, SymbolDef>; hidden: string[] } {
  const merged: Record<string, SymbolDef> = {};
  const hidden: string[] = [];
  for (const row of rows) {
    const def = rowToDef(row);
    merged[row.key] = existing[row.key] ? { ...existing[row.key], ...def } : def;
    if (row.hidden) hidden.push(row.key);
  }
  return { merged, hidden };
}

// ---- offline cache -----------------------------------------------------------
// The last successfully-fetched library, mirrored to localStorage so an offline
// session (or a page open before the network settles) still sees the shared
// catalog — not just built-ins + the current project's own customs.
const CACHE_KEY = 'aemp.symbols.cache.v1';

/** Read the cached library rows. [] when unavailable or unparsable. */
export function readSymbolCache(): SymbolRow[] {
  try {
    if (typeof localStorage === 'undefined') return [];
    const raw = localStorage.getItem(CACHE_KEY);
    const rows = raw ? JSON.parse(raw) : [];
    return Array.isArray(rows) ? (rows as SymbolRow[]) : [];
  } catch {
    return [];
  }
}

/** Best-effort mirror of the fetched library to localStorage. */
function writeSymbolCache(rows: SymbolRow[]): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(CACHE_KEY, JSON.stringify(rows));
  } catch {
    /* quota / unavailable — the cache is best-effort */
  }
}

/** Fetch the whole global library. [] when Supabase isn't configured. */
export async function listSymbols(): Promise<SymbolRow[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.from('symbols').select('key, name, cat, w, h, color, svg, shapes, custom, hidden');
  if (error) throw new Error(error.message);
  const rows = (data as SymbolRow[]) ?? [];
  writeSymbolCache(rows); // refresh the offline cache (also clears it when empty)
  return rows;
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
