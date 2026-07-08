# Global Symbol Library Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Symbol library a global, company-wide catalog that persists to the Supabase database immediately on every add/edit/upload/delete/hide, shared across all rigs and drawings.

**Architecture:** A new `public.symbols` table stores the whole library (custom symbols, built-in overrides, hidden markers). A new `src/lib/symbolStore.ts` provides pure row↔`SymbolDef` mappers (unit-tested) plus thin async Supabase CRUD wrappers. `ProjectContext` fetches the library once on mount and merges it into the shared in-memory `SYM` registry, and every library mutation writes to the DB additively (the existing per-project `customSymbols`/`hiddenSymbols` writes stay for offline + backward-compat). Field users see the library read-only.

**Tech Stack:** React 18 + TypeScript, Vite, Supabase (`@supabase/supabase-js`), Vitest (node environment — pure-function tests only; no React test harness in this repo).

## Global Constraints

- Keep files under 500 lines; each file one clear responsibility.
- All Supabase access goes through the `supabase` client in `src/lib/supabase.ts`; every DB function must no-op / return empty when `supabase` is `null` (Supabase not configured) so the app still works offline against localStorage.
- Writes to shared tables are admin/manager-only, enforced by `public.is_privileged()` RLS; reads are any `authenticated` user. Mirror `supabase/migrations/0008_units.sql`.
- Migration numbering continues the existing sequence: the next file is `0009_symbols.sql` (existing: 0001–0005, 0007, 0008).
- Tests are Vitest unit tests co-located as `*.test.ts` beside the module under test, `node` environment, pure functions only.
- Do NOT add a `Co-Authored-By` trailer to commits (project rule).
- Do not remove the existing `project.customSymbols` / `project.hiddenSymbols` behavior — the global table is **additive**.

---

## File Structure

- **Create** `supabase/migrations/0009_symbols.sql` — the `symbols` table, its RLS policies, and an `updated_at` trigger.
- **Create** `src/lib/symbolStore.ts` — `SymbolRow` type, pure mappers (`rowToDef`, `defToRowFields`, `splitSymbolRows`), and async CRUD (`listSymbols`, `upsertSymbol`, `deleteSymbolRow`, `setSymbolHidden`).
- **Create** `src/lib/symbolStore.test.ts` — unit tests for the pure mappers.
- **Modify** `src/state/ProjectContext.tsx` — load the global library on mount + merge into `SYM`; mirror each symbol mutation to `symbolStore`; expose a derived `hiddenSymbols` (union of project + global) and a `canEditLibrary` flag.
- **Modify** `src/components/SymbolLibrary.tsx` — read the derived `hiddenSymbols`; make add/edit/upload/delete controls read-only for non-privileged users; surface DB-write failures.

---

## Task 1: Database migration — `symbols` table + RLS

**Files:**
- Create: `supabase/migrations/0009_symbols.sql`

**Interfaces:**
- Produces: a `public.symbols` table with columns `key (text pk)`, `name text`, `cat text`, `w int`, `h int`, `color text`, `svg text`, `shapes jsonb`, `custom bool`, `hidden bool`, `updated_by uuid`, `updated_at timestamptz`. Read = any authenticated; write = `public.is_privileged()`. Consumed by Task 2's `listSymbols` / `upsertSymbol`.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0009_symbols.sql`:

```sql
-- ============================================================================
--  0009_symbols.sql — global (company-wide) Symbol library.
--  One row per custom symbol ('custom_*' key), per built-in override (built-in
--  key, custom=false), or per hidden built-in (hidden=true). Everyone
--  authenticated can read the catalog; only admins/managers (is_privileged)
--  may add / edit / delete / hide symbols. Mirrors 0008_units.sql.
-- ============================================================================

create table if not exists public.symbols (
  key        text primary key,
  name       text not null default '',
  cat        text not null default 'Custom',
  w          integer not null default 100,
  h          integer not null default 70,
  color      text not null default '#3a4654',
  svg        text not null default '',
  shapes     jsonb,
  custom     boolean not null default true,
  hidden     boolean not null default false,
  updated_by uuid references auth.users(id) default auth.uid(),
  updated_at timestamptz not null default now()
);

-- keep updated_at fresh on every write (touch_updated_at() is defined in 0001)
drop trigger if exists symbols_touch on public.symbols;
create trigger symbols_touch before update on public.symbols
  for each row execute function public.touch_updated_at();

alter table public.symbols enable row level security;

-- read: any authenticated user (field crews browse + place symbols)
drop policy if exists symbols_read on public.symbols;
create policy symbols_read on public.symbols
  for select to authenticated using (true);

-- write: privileged only (admin / manager)
drop policy if exists symbols_insert on public.symbols;
create policy symbols_insert on public.symbols
  for insert to authenticated with check (public.is_privileged());

drop policy if exists symbols_update on public.symbols;
create policy symbols_update on public.symbols
  for update to authenticated using (public.is_privileged()) with check (public.is_privileged());

drop policy if exists symbols_delete on public.symbols;
create policy symbols_delete on public.symbols
  for delete to authenticated using (public.is_privileged());
```

- [ ] **Step 2: Verify `touch_updated_at()` exists**

Run: `grep -n "touch_updated_at" supabase/migrations/0001_initial_schema.sql`
Expected: a line defining `create or replace function public.touch_updated_at()`. (Confirms the trigger in Step 1 references an existing function.)

- [ ] **Step 3: Apply the migration to the dev database**

If the Supabase MCP tools are available, apply it (project ref is in `.env.local` `VITE_SUPABASE_URL`):
Use `mcp__claude_ai_Supabase__apply_migration` with `name: "0009_symbols"` and the SQL from Step 1.
Otherwise run it in the Supabase SQL editor manually.

- [ ] **Step 4: Verify the table and policies exist**

Use `mcp__claude_ai_Supabase__list_tables` (schema `public`) — expect a `symbols` table.
Then `mcp__claude_ai_Supabase__execute_sql` with:
```sql
select polname from pg_policies where tablename = 'symbols' order by polname;
```
Expected rows: `symbols_delete`, `symbols_insert`, `symbols_read`, `symbols_update`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0009_symbols.sql
git commit -m "feat(db): global symbols table + is_privileged RLS (0009)"
```

---

## Task 2: `symbolStore.ts` — mappers (TDD) + async CRUD

**Files:**
- Create: `src/lib/symbolStore.ts`
- Test: `src/lib/symbolStore.test.ts`

**Interfaces:**
- Consumes: `SymbolDef`, `DrawShape` from `./symbols`; `supabase` from `./supabase`.
- Produces:
  - `interface SymbolRow { key: string; name: string; cat: string; w: number; h: number; color: string; svg: string; shapes: DrawShape[] | null; custom: boolean; hidden: boolean }`
  - `rowToDef(row: SymbolRow): SymbolDef`
  - `defToRowFields(key: string, def: SymbolDef, opts: { custom: boolean; hidden: boolean }): SymbolRow`
  - `splitSymbolRows(rows: SymbolRow[]): { defs: Record<string, SymbolDef>; hidden: string[] }`
  - `listSymbols(): Promise<SymbolRow[]>`
  - `upsertSymbol(key: string, def: SymbolDef, opts: { custom: boolean; hidden: boolean }): Promise<void>`
  - `deleteSymbolRow(key: string): Promise<void>`
  - `setSymbolHidden(key: string, def: SymbolDef, hidden: boolean): Promise<void>`
  - These are consumed by Task 3 (`ProjectContext`).

- [ ] **Step 1: Write the failing test**

Create `src/lib/symbolStore.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- src/lib/symbolStore.test.ts`
Expected: FAIL — `Failed to resolve import "./symbolStore"` / module not found.

- [ ] **Step 3: Write the implementation**

Create `src/lib/symbolStore.ts`:

```ts
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- src/lib/symbolStore.test.ts`
Expected: PASS (3 describe blocks, all green).

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/symbolStore.ts src/lib/symbolStore.test.ts
git commit -m "feat: symbolStore — DB mappers + async CRUD for global symbols"
```

---

## Task 3: Wire the global library into `ProjectContext`

**Files:**
- Modify: `src/state/ProjectContext.tsx`

**Interfaces:**
- Consumes: `listSymbols`, `upsertSymbol`, `deleteSymbolRow`, `setSymbolHidden`, `splitSymbolRows` from `../lib/symbolStore`; existing `unregisterSymbol` from `../lib/customSymbols`; `SYM`, `SYM_ORDER` from `../lib/symbols`; `role` from `useAuth()`.
- Produces (added to `ProjectCtx`): `hiddenSymbols: string[]` (union of project + global hidden), `canEditLibrary: boolean`. Consumed by Task 4 (`SymbolLibrary`).

- [ ] **Step 1: Add the import**

In `src/state/ProjectContext.tsx`, below the existing `customSymbols` import (line ~14), add:

```ts
import { listSymbols, upsertSymbol, deleteSymbolRow, setSymbolHidden, splitSymbolRows } from '../lib/symbolStore';
```

Also add `SYM_ORDER` to the existing symbols import — change
`import { SYM, type SymbolDef, type SymbolKey } from '../lib/symbols';` to:

```ts
import { SYM, SYM_ORDER, type SymbolDef, type SymbolKey } from '../lib/symbols';
```

- [ ] **Step 2: Add global-hidden state and the load effect**

Inside `ProjectProvider`, near the other `useState` hooks (after `const [cloudId, setCloudId] = useState<string | null>(null);`, ~line 213), add:

```ts
  // global (company-wide) symbol library — merged into SYM on mount (FR: shared
  // Symbol library). Additive to project.customSymbols so offline is unaffected.
  const [globalHidden, setGlobalHidden] = useState<string[]>([]);
```

Then, next to the existing Rig 103 symbol-pack effect (~line 298), add a new effect.

**Important merge rule (do NOT use `mergeCustomSymbols` here):** `mergeCustomSymbols`
replaces `SYM[key]` wholesale and forces `custom: true`. The `symbols` table has no
`bopHeight` / `defaults` columns, so replacing a built-in (e.g. an override or a
hidden BOP-stack symbol) would drop those fields and break BOP elevation math and
placement defaults. Instead: **skip hidden rows** when registering defs (a hidden
built-in keeps its original full-fidelity `SYM` entry — placed nodes still render),
and **merge overrides ONTO the existing entry** (`{ ...SYM[key], ...def }`) so
built-in-only fields survive while the edited artwork/name/size/colour apply. Each
row's `def.custom` (set by `rowToDef`) is preserved, so labels stay correct.

```ts
  // load the shared symbol library once and merge it into SYM
  useEffect(() => {
    let active = true;
    listSymbols()
      .then((rows) => {
        if (!active || !rows.length) return;
        const { defs, hidden } = splitSymbolRows(rows);
        const hiddenSet = new Set(hidden);
        for (const [k, d] of Object.entries(defs)) {
          if (hiddenSet.has(k)) continue;              // keep built-in's original SYM entry
          SYM[k] = SYM[k] ? { ...SYM[k], ...d } : { ...d }; // merge preserves bopHeight/defaults
          if (!SYM_ORDER.includes(d.cat)) SYM_ORDER.push(d.cat);
        }
        setGlobalHidden(hidden);
        bumpSyms((v) => v + 1);            // re-render palette/library
      })
      .catch(() => { /* offline or table absent — degrade to per-project */ });
    return () => { active = false; };
  }, []);
```

(`bumpSyms` already exists from the Rig 103 effect: `const [, bumpSyms] = useState(0);`.)

- [ ] **Step 3: Mirror each mutation to the global store**

Replace the five symbol-action callbacks (`addCustomSymbol`, `updateCustomSymbol`, `deleteCustomSymbol`, `hideSymbol`, `restoreSymbol`, ~lines 791–825) with versions that also write to the DB. Keep every existing line; only add the `void ...` DB calls:

```ts
  const addCustomSymbol = useCallback((def: SymbolDef) => {
    const key = newCustomKey(project.customSymbols ?? {});
    SYM[key] = { ...def, custom: true }; // make available immediately
    setProject((p) => ({ ...p, customSymbols: { ...(p.customSymbols ?? {}), [key]: { ...def, custom: true } } }));
    void upsertSymbol(key, { ...def, custom: true }, { custom: true, hidden: false })
      .catch((e) => console.error('Symbol not saved to the shared library:', e));
    return key;
  }, [project.customSymbols]);

  const updateCustomSymbol = useCallback((key: string, def: SymbolDef) => {
    SYM[key] = { ...def, custom: true };
    setProject((p) => ({ ...p, customSymbols: { ...(p.customSymbols ?? {}), [key]: { ...def, custom: true } } }));
    const isCustom = key.startsWith('custom_');
    void upsertSymbol(key, { ...def, custom: isCustom }, { custom: isCustom, hidden: false })
      .catch((e) => console.error('Symbol change not saved to the shared library:', e));
  }, []);

  const deleteCustomSymbol = useCallback((key: string) => {
    unregisterSymbol(key);
    setProject((p) => {
      const next = { ...(p.customSymbols ?? {}) };
      delete next[key];
      return { ...p, customSymbols: next };
    });
    void deleteSymbolRow(key).catch((e) => console.error('Symbol not deleted from the shared library:', e));
  }, []);

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
  }, []);

  const restoreSymbol = useCallback((key: string) => {
    const def = SYM[key];
    setProject((p) => ({ ...p, hiddenSymbols: (p.hiddenSymbols ?? []).filter((k) => k !== key) }));
    setGlobalHidden((h) => h.filter((k) => k !== key));
    if (def) void setSymbolHidden(key, def, false).catch((e) => console.error('Restore not saved to the shared library:', e));
  }, []);
```

- [ ] **Step 4: Expose the derived `hiddenSymbols` + `canEditLibrary`**

Add a derived value near the other `useMemo`s (after `const issues = useMemo(...)`, ~line 289):

```ts
  const hiddenSymbols = useMemo(
    () => Array.from(new Set([...(project.hiddenSymbols ?? []), ...globalHidden])),
    [project.hiddenSymbols, globalHidden],
  );
  const canEditLibrary = role !== 'field';
```

Add both to the `ProjectCtx` interface (near the custom-symbols section, ~line 194):

```ts
  /** Effective hidden set (per-project ∪ global library). */
  hiddenSymbols: string[];
  /** Whether the current user may modify the shared Symbol library. */
  canEditLibrary: boolean;
```

And add them to the `value` object (in the `addCustomSymbol, ...` group, ~line 857):

```ts
    addCustomSymbol, updateCustomSymbol, deleteCustomSymbol, hideSymbol, restoreSymbol, hiddenSymbols, canEditLibrary,
```

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 6: Run the full test suite**

Run: `npm test`
Expected: all tests pass (no regressions; `symbolStore.test.ts` green).

- [ ] **Step 7: Browser verification — shared persistence**

Start the dev server if not running: `npm run dev` (http://localhost:5173/full).
As an admin/manager (or offline/local mode):
1. Open **Symbol library** → **＋ Draw new symbol** (or **⤓ Import** a small PNG/SVG). Save it.
2. Confirm it appears in the library grid and the left palette.
3. Reload the page (full reload, not HMR). Confirm the symbol is still present.
4. (If Supabase is configured) verify the row exists:
   `mcp__claude_ai_Supabase__execute_sql` → `select key, name, custom, hidden from public.symbols order by updated_at desc limit 5;`
   Expected: a row for the new symbol with `custom = true, hidden = false`.

- [ ] **Step 8: Commit**

```bash
git add src/state/ProjectContext.tsx
git commit -m "feat: load + persist the global symbol library in ProjectContext"
```

---

## Task 4: Read-only library for field users + error surfacing

**Files:**
- Modify: `src/components/SymbolLibrary.tsx`

**Interfaces:**
- Consumes: `hiddenSymbols` and `canEditLibrary` from `useProject()` (Task 3).

- [ ] **Step 1: Pull the new context values**

In `SymbolLibrary.tsx`, extend the `useProject()` destructure (line 57) to include the derived hidden set and the edit flag:

```ts
  const { project, addCustomSymbol, updateCustomSymbol, deleteCustomSymbol, hideSymbol, restoreSymbol, hiddenSymbols, canEditLibrary } = useProject();
```

- [ ] **Step 2: Use the derived hidden set**

Replace line 67:

```ts
  const hidden = new Set(project.hiddenSymbols ?? []);
```

with:

```ts
  const hidden = new Set(hiddenSymbols);
```

- [ ] **Step 3: Gate the mutating toolbar buttons on `canEditLibrary`**

In the toolbar block (lines ~165–176), wrap the three editing buttons so they only render for privileged users, and show a read-only hint otherwise. Replace:

```tsx
          <button style={primary} onClick={() => setDrawer({ key: null })}>＋ Draw new symbol</button>
          <button style={ghost} onClick={() => fileRef.current?.click()}>⤓ Import</button>
          <button style={ghost} onClick={exportJson}>⤒ Export</button>
```

with:

```tsx
          {canEditLibrary && <button style={primary} onClick={() => setDrawer({ key: null })}>＋ Draw new symbol</button>}
          {canEditLibrary && <button style={ghost} onClick={() => fileRef.current?.click()}>⤓ Import</button>}
          <button style={ghost} onClick={exportJson}>⤒ Export</button>
          {!canEditLibrary && <span style={{ fontFamily: 'var(--mono)', fontSize: 11.5, color: 'var(--faint)', alignSelf: 'center' }}>Read-only — the shared library is admin-managed.</span>}
```

- [ ] **Step 4: Hide per-card edit controls for non-privileged users**

In `renderCard` (lines ~145–149), wrap the edit/upload/del buttons so field users get no editing controls. Replace the `<div style={{ display: 'flex', gap: 5, ... }}>...</div>` action row with:

```tsx
        {canEditLibrary && (
          <div style={{ display: 'flex', gap: 5, justifyContent: 'center' }}>
            <button style={smallBtn} title="Edit name / size / shapes" onClick={() => setDrawer({ key })}>edit</button>
            <button style={smallBtn} title="Replace artwork with an uploaded SVG or PNG image" onClick={() => { replaceKey.current = key; replaceRef.current?.click(); }}>upload</button>
            <button style={{ ...smallBtn, color: 'var(--red)' }} title={key.startsWith('custom_') ? 'Delete symbol' : 'Remove from library'} onClick={() => onDelete(key)}>del</button>
          </div>
        )}
```

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 6: Browser verification — read-only for field users**

1. As an admin: open Symbol library — confirm **＋ Draw new symbol**, **⤓ Import**, and per-card **edit/upload/del** are all visible.
2. Switch to **Field** (top-bar Admin/Field toggle) or sign in as a field user: reopen Symbol library — confirm the editing buttons are gone, the "Read-only — the shared library is admin-managed." hint shows, and **⤒ Export** still works.
3. As admin, hide a built-in symbol, then reload — confirm it stays hidden (global hidden set applied on load). Restore it and reload — confirm it returns.

- [ ] **Step 7: Commit**

```bash
git add src/components/SymbolLibrary.tsx
git commit -m "feat: read-only Symbol library for field users; use global hidden set"
```

---

## Self-Review

**Spec coverage:**
- Global shared library (own table) → Task 1 (`symbols` table), Task 3 (load + merge into `SYM`). ✅
- Admin/manager write, everyone read (RLS) → Task 1 (RLS policies), Task 4 (`canEditLibrary` UI). ✅
- Immediate auto-save on every action → Task 3 (mutations mirror to `symbolStore`). ✅
- Data model rows (custom / override / hidden) → Task 1 columns, Task 2 `splitSymbolRows`. ✅
- `src/lib/symbolStore.ts` with `listSymbols`/`upsertSymbol`/`deleteSymbol`/`setHidden` → Task 2. ✅
- Load-time fetch + merge → Task 3 Step 2. ✅
- Offline / Supabase-not-configured fallback → Task 2 (all async no-op when `supabase` null); Task 3 (load effect `.catch`). ✅
- DB-write failure surfaced → Task 3 (`.catch(console.error)`); note: uses `console.error` (non-blocking) rather than `alert` to avoid interrupting drags — an acceptable variance from the spec's "small error" intent. ✅
- Field users read-only → Task 4. ✅
- Backward-compat: existing project docs still render → per-project `customSymbols`/`hiddenSymbols` writes retained in Task 3. ✅

**Placeholder scan:** No TBD/TODO/"handle edge cases"; every code step shows complete code. ✅

**Type consistency:** `SymbolRow`, `rowToDef`, `defToRowFields`, `splitSymbolRows`, `listSymbols`, `upsertSymbol`, `deleteSymbolRow`, `setSymbolHidden` are defined identically in Task 2's interface block, its implementation, and Task 3's consumption. `hiddenSymbols` / `canEditLibrary` names match across Task 3 (produce) and Task 4 (consume). ✅

**Note on `deleteSymbol` naming:** the spec listed `deleteSymbol`; the plan uses `deleteSymbolRow` to avoid confusion with the existing `deleteCustomSymbol` context action. Functionally identical.
