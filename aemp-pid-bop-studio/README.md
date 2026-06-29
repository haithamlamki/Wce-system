# AEMP P&ID & BOP Studio — Phase-1 (production rewrite)

React + Vite + TypeScript rewrite of the Phase-0 single-file prototype
(`../rig_pid_bop_studio (12) 1.html`), per the PRD §12 architecture.

The prototype's reusable core — the **symbol library**, **status engine**, and
**layout/AEMP/BOP/rewards logic** — has been extracted into typed modules under
`src/lib`. The React views consume those modules; no rendering logic is
duplicated from the prototype.

## Quick start

```bash
cd "aemp-pid-bop-studio"
npm install
cp .env.example .env.local   # fill in Supabase URL + publishable key
npm run dev        # http://localhost:5173
npm run typecheck  # tsc --noEmit
npm run build      # production bundle
```

## Backend (Supabase)

Cloud persistence + the AEMP-equivalent equipment register run on Supabase
(project `Wce-system`). Schema: `supabase/migrations/0001_initial_schema.sql`.
Seed the equipment register with the Rig 303 dataset:

```bash
node --env-file=.env.local scripts/seed-equipment.mjs
```

The header **☁ Cloud** button saves/opens projects; **Import from AEMP** reads
the Supabase `equipment` table (falling back to the embedded cache offline).
See `docs/INTEGRATION.md` for the schema, security notes, and the AEMP API
contract still required for live integration.

## Layout

```
src/
  types.ts                 Core data model (PRD §8): Component, Pipe, Project, BopScheme…
  theme.css                Light/dark/auto design tokens (FR-56/57)
  main.tsx, App.tsx        Entry + app shell (header, tabs, routes, theme cycle)
  state/
    ProjectContext.tsx     In-memory project store + actions (swap for AEMP server in P1)
  lib/                     ◀── EXTRACTED REUSABLE ENGINE
    symbols.ts             30 SVG WCE symbols + categories + auto-connect (PRD §9)
    status.ts              statusOf(), summarize(), colour/label maps (FR-29/30)
    bop.ts                 BOP heights + auto-build-by-section + metrics (§7.8)
    rewards.ts             Tiers, points, achievements, redemptions (§7.13)
    aemp.ts                buildMaster() + importFromAEMP() + tag mapping (§7.9/7.10)
    data/
      rig303-equipment.ts  172-component Rig 303 inspection dataset (AEMP offline cache)
      rig305-layout.ts     Rig 305 master layout (160 placements + 41 pipes)
  views/
    PidFullView.tsx        Master canvas — palette + read-only SVG render (scaffold)
    BopSchemeView.tsx      Elevation controls + auto-build + stack table (scaffold)
    RegisterView.tsx       Equipment register — FULLY WIRED (search/filter/CSV/status)
    AccountView.tsx        Steward rewards dashboard (scaffold)
```

## What's done vs. TODO

**Done:**
- Engine modules: symbol library, status engine, master build, AEMP import
  (cache), BOP auto-build, rewards math.
- **Equipment Register** — fully wired (search/filter/CSV/live status).
- **Interactive P&ID canvas** — pan / wheel-zoom / fit, snap-to-grid,
  drag-from-palette + click-to-place with **approve bar**, select/move,
  connect/route, **swap symbol type** (FR-16), rotate/flip/scale/duplicate/delete
  with **"apply to all of this type"** (FR-18), keyboard shortcuts,
  properties panel, **field as-built toggle**, hover tooltips, **title block +
  piping legend**, and a **3D isometric** presentation view.
- **Equipment Register** "view ▸" jumps to and re-centres the item on the
  diagram (FR-27); **Account** rewards are redeemable and persist (FR-55).
- **BOP scaled elevation** — datum→RKB axis, to-scale components, editable
  heights, clearance-to-RT dimension, m/ft units, hover status.
- **Save / Open `.json` + debounced autosave** to localStorage (FR-58).
- **Date-first onboarding modal + editable project chip** (FR-1/2/3/4).
- **AI assistant (preview)** — deterministic NL planner: build master, BOP
  stack, import, place symbols, clear (FR-47; production = AEMP model, FR-48).

**Phase-1 TODO (carried from PRD §7):**
- AEMP **live** integration — finalise endpoint/auth/field-map (PRD §16.1 blocker).
- Auth/RBAC via AEMP SSO; **server** persistence + revision history (FR-59).
- Layout import service (drawing → template); shared/real leaderboard (FR-54).

> Dev note: `state/ProjectContext.tsx` exports both a provider component and the
> `useProject` hook, so Vite Fast Refresh full-reloads on edits to that file
> (harmless). Split the hook into its own module if that becomes annoying.

> The live AEMP endpoint in `lib/aemp.ts` is a **stub**; calls fall back to the
> embedded Rig 303 cache until the AEMP API contract is supplied.
