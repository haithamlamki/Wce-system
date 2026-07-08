// ============================================================================
//  Symbol library hook (F19 extraction from ProjectContext.tsx).
//  Owns: the shared (company-wide) Symbol library sync (offline cache + DB
//  refresh + the lazy Rig 103 built-in pack) and the per-project custom-symbol
//  CRUD (create / edit / delete / hide / restore). Additive to the SYM
//  registry so offline use is unaffected.
//
//  Inputs:  role (for the edit-library permission check), the project's
//           customSymbols + hiddenSymbols slices, and setProject.
//  Outputs: hiddenSymbols (effective = project ∪ global), canEditLibrary, and
//           the custom-symbol action functions exposed on useProject().
// ============================================================================
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Project } from '../../types';
import { SYM, SYM_ORDER, type SymbolDef } from '../../lib/symbols';
import { mergeCustomSymbols, newCustomKey, registerBuiltins, unregisterSymbol } from '../../lib/customSymbols';
import { sanitizeSvg, safeColor } from '../../lib/sanitizeSvg';
import {
  listSymbols, upsertSymbol, deleteSymbolRow, setSymbolHidden, mergeLibraryRows, readSymbolCache,
  type SymbolRow,
} from '../../lib/symbolStore';
import { canEditForRole } from '../../lib/roles';
import type { Role } from '../AuthContext';

export interface SymbolLibraryApi {
  hiddenSymbols: string[];
  canEditLibrary: boolean;
  addCustomSymbol: (def: SymbolDef) => string;
  updateCustomSymbol: (key: string, def: SymbolDef) => void;
  deleteCustomSymbol: (key: string) => void;
  hideSymbol: (key: string) => void;
  restoreSymbol: (key: string) => void;
}

export function useSymbolLibrary(
  role: Role | null,
  customSymbols: Project['customSymbols'],
  projectHiddenSymbols: string[] | undefined,
  setProject: React.Dispatch<React.SetStateAction<Project>>,
): SymbolLibraryApi {
  // global (company-wide) symbol library — merged into SYM on mount.
  const [globalHidden, setGlobalHidden] = useState<string[]>([]);
  // bumps to force a re-render when SYM/SYM_ORDER are mutated in place below
  // (they're a shared module-level registry, not React state).
  const [, bumpSyms] = useState(0);

  // keep the shared SYM registry in sync with the project's custom symbols
  // (covers open/load/cloud-restore; live edits also mutate SYM directly)
  useEffect(() => { mergeCustomSymbols(customSymbols); }, [customSymbols]);

  // lazy-load the Rig 103 symbol pack (incl. logos + P&ID reference) as built-ins
  // on startup — kept out of the initial bundle (it's a large chunk).
  useEffect(() => {
    let active = true;
    import('../../lib/data/rig103-symbols')
      .then((m) => { if (active && registerBuiltins(m.RIG103_SYMBOLS)) bumpSyms((v) => v + 1); })
      .catch(() => { /* optional pack */ });
    return () => { active = false; };
  }, []);

  // load the shared symbol library: apply the offline cache immediately (so the
  // full catalog is present offline / before the network settles), then refresh
  // from the DB. Both merge onto SYM preserving built-in-only fields.
  useEffect(() => {
    let active = true;
    const apply = (rows: SymbolRow[]) => {
      if (!active || !rows.length) return;
      const { merged, hidden } = mergeLibraryRows(SYM, rows);
      for (const [k, d] of Object.entries(merged)) {
        SYM[k] = d;
        if (!SYM_ORDER.includes(d.cat)) SYM_ORDER.push(d.cat);
      }
      setGlobalHidden(hidden);
      bumpSyms((v) => v + 1);            // re-render palette/library
    };
    apply(readSymbolCache());            // instant + offline
    listSymbols()
      .then(apply)
      .catch(() => { /* offline or table absent — cache already applied */ });
    return () => { active = false; };
  }, []);

  const hiddenSymbols = useMemo(
    () => Array.from(new Set([...(projectHiddenSymbols ?? []), ...globalHidden])),
    [projectHiddenSymbols, globalHidden],
  );
  const canEditLibrary = canEditForRole(role);

  const addCustomSymbol = useCallback((def: SymbolDef) => {
    const key = newCustomKey(customSymbols ?? {});
    const clean = { ...def, svg: sanitizeSvg(def.svg), color: safeColor(def.color), custom: true };
    SYM[key] = clean; // make available immediately
    setProject((p) => ({ ...p, customSymbols: { ...(p.customSymbols ?? {}), [key]: clean } }));
    void upsertSymbol(key, clean, { custom: true, hidden: false })
      .catch((e) => console.error('Symbol not saved to the shared library:', e));
    return key;
  }, [customSymbols, setProject]);

  const updateCustomSymbol = useCallback((key: string, def: SymbolDef) => {
    const isCustom = key.startsWith('custom_');
    const clean = { ...def, svg: sanitizeSvg(def.svg), color: safeColor(def.color), custom: true };
    SYM[key] = clean;
    setProject((p) => ({ ...p, customSymbols: { ...(p.customSymbols ?? {}), [key]: clean } }));
    void upsertSymbol(key, { ...clean, custom: isCustom }, { custom: isCustom, hidden: false })
      .catch((e) => console.error('Symbol change not saved to the shared library:', e));
  }, [setProject]);

  const deleteCustomSymbol = useCallback((key: string) => {
    unregisterSymbol(key);
    setProject((p) => {
      const next = { ...(p.customSymbols ?? {}) };
      delete next[key];
      return { ...p, customSymbols: next };
    });
    void deleteSymbolRow(key).catch((e) => console.error('Symbol not deleted from the shared library:', e));
  }, [setProject]);

  // Hide a built-in (keep SYM[key] so placed nodes still render) and drop any
  // per-project override of it. Reversible via restoreSymbol.
  const hideSymbol = useCallback((key: string) => {
    const def = SYM[key];
    setProject((p) => {
      const custom = { ...(p.customSymbols ?? {}) };
      delete custom[key];
      const hidden = p.hiddenSymbols ?? [];
      return { ...p, customSymbols: custom, hiddenSymbols: hidden.includes(key) ? hidden : [...hidden, key] };
    });
    setGlobalHidden((h) => (h.includes(key) ? h : [...h, key]));
    if (def) void setSymbolHidden(key, def, true).catch((e) => console.error('Hide not saved to the shared library:', e));
  }, [setProject]);

  const restoreSymbol = useCallback((key: string) => {
    const def = SYM[key];
    setProject((p) => ({ ...p, hiddenSymbols: (p.hiddenSymbols ?? []).filter((k) => k !== key) }));
    setGlobalHidden((h) => h.filter((k) => k !== key));
    if (def) void setSymbolHidden(key, def, false).catch((e) => console.error('Restore not saved to the shared library:', e));
  }, [setProject]);

  return { hiddenSymbols, canEditLibrary, addCustomSymbol, updateCustomSymbol, deleteCustomSymbol, hideSymbol, restoreSymbol };
}
