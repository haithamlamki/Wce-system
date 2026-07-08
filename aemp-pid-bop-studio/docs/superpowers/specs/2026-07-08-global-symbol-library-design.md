# Global Symbol Library — Design

**Date:** 2026-07-08
**Status:** Approved (design), pending implementation plan

## Problem

When a user adds, draws, uploads, edits, hides, or deletes a symbol in the
**Symbol library**, the change is not saved permanently to the database.

Today symbols live inside the **project document** (`project.customSymbols` and
`project.hiddenSymbols`). That document:

- auto-saves only to **browser localStorage** (debounced), and
- reaches the **Supabase database** only when someone explicitly hits
  **Save / Cloud** (draft or publish), as one JSONB blob, and
- is **per-project / per-unit** — a symbol added on Rig 103 travels only with
  Rig 103's drawing, not with other rigs.

So a newly added symbol can be lost (never cloud-saved) and is never shared
across drawings.

## Goal

Make the Symbol library a **global, company-wide catalog** that persists to the
database **immediately** on every change, shared across all rigs/units/drawings.

## Decisions (confirmed with user)

1. **Scope:** Global shared library — one catalog for the whole app, in its own
   database table. A symbol added/edited on any rig is instantly available on
   every rig and drawing, and persists independently of any project.
2. **Permissions:** Admins & managers (`is_privileged`) may add/edit/delete/hide;
   field/end users see the library read-only. Enforced by Supabase RLS —
   consistent with `units`, `equipment`, and `manuals`.
3. **Save timing:** Immediate auto-save on every library action. No "Save" step.

## Approach (chosen: A)

**A — Dedicated `symbols` table, immediate auto-save.** A new Supabase table
holds the whole library (custom symbols, built-in overrides, hidden markers).
Every library action writes to the DB right then; on app load the library is
fetched and merged into the in-memory `SYM` registry. Mirrors how `units`,
`equipment`, and `manuals` already work.

Rejected alternatives:

- **B — Keep symbols in the project doc, auto-push project to cloud on symbol
  change.** Symbols stay per-drawing (contradicts the global decision) and forces
  a full-project write on every tiny symbol tweak.
- **C — Supabase Storage for artwork + table for metadata.** Overkill; symbols are
  already small inline SVG / data-URIs, and Storage adds signed-URL/async
  complexity. YAGNI.

## Section 1 — Data model

New migration `supabase/migrations/0009_symbols.sql` creating one table that
captures everything the library does today:

```
public.symbols
  key         text primary key      -- 'custom_xxx' for a new symbol,
                                     -- or a built-in key ('gate') for an override / hide
  name        text
  cat         text
  w           integer
  h           integer
  color       text
  svg         text                  -- inner SVG markup / <image> data-URI
  shapes      jsonb                 -- optional structured shapes (nullable)
  custom      boolean               -- true = brand-new symbol; false = override of a built-in
  hidden      boolean not null default false  -- true = removed/hidden from library & palette
  updated_by  uuid  default auth.uid()
  updated_at  timestamptz not null default now()
```

Row meanings:

- **New custom symbol:** `key = 'custom_*'`, `custom = true`, `hidden = false`,
  full def columns populated.
- **Built-in override** (edited name/size, replaced artwork): `key =` the built-in
  key, `custom = false`, `hidden = false`, def columns hold the override.
- **Hidden built-in:** `key =` the built-in key, `hidden = true`.

RLS (mirrors `0008_units.sql`):

- `select` — any `authenticated` user (so field crews can browse/place).
- `insert` / `update` / `delete` — `public.is_privileged()` only.

## Section 2 — App integration & data flow

- **New `src/lib/symbolStore.ts`** (mirrors `cloud.ts` patterns):
  - `listSymbols(): Promise<SymbolRow[]>`
  - `upsertSymbol(key, def): Promise<void>`
  - `deleteSymbol(key): Promise<void>`
  - `setHidden(key, hidden): Promise<void>`
  - All no-op / return empty when Supabase is not configured.
- **On app load:** fetch the global library once and merge into the shared `SYM`
  registry (`registerBuiltins` / `mergeCustomSymbols`), and build the global
  hidden set — so every rig/drawing sees the same library.
- **On every library action** (draw new, upload, replace artwork, edit, delete,
  hide, restore): update `SYM` in memory immediately (instant UI, as today) **and**
  write to the DB right then. No "Save" step.
- **Library moves out of the per-project doc.** `project.customSymbols` /
  `project.hiddenSymbols` remain **readable** for backward-compat (old saved
  drawings still render their embedded symbols), but new edits go to the global
  `symbols` table. The `ProjectContext` symbol actions
  (`addCustomSymbol`, `updateCustomSymbol`, `deleteCustomSymbol`, `hideSymbol`,
  `restoreSymbol`) are re-pointed at `symbolStore` while keeping the in-memory
  `SYM` update.

## Section 3 — Offline / failure handling

- **Supabase not configured** → library falls back to the current
  localStorage-in-project behavior; nothing breaks.
- **A DB write fails** (field user without rights, or network) → the in-memory
  change is kept, but a small error is surfaced (matching the existing `alert(...)`
  pattern in `SymbolLibrary.tsx`) so the user knows it did not persist globally.
- **Field users** → library controls are read-only (browse/place only, no
  add/edit), consistent with the RLS.

## Out of scope (YAGNI)

- Migrating symbols already embedded in existing saved project docs into the
  global table (they keep rendering via the backward-compat read path).
- Per-rig symbol scoping / categories beyond the existing `cat` field.
- Symbol versioning / history (the `projects` doc history is unaffected).

## Success criteria

1. An admin adds/draws/uploads a symbol on one rig; after a full reload (and on a
   different rig/drawing) the symbol is present — with no explicit Save.
2. An admin edits a built-in's artwork/name/size or hides it; the change is
   visible on every drawing after reload.
3. A field user sees the same library read-only and can place symbols but not
   modify the catalog.
4. With Supabase not configured, the app behaves exactly as before (no errors).
