# Rig String Builder Module Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add "Rig String Builder" (BHA · Pipe Tally · Ton-Mile · Daily · Rotating Hrs · Mud Pumps · Trip Sheet · Kill Sheet · Formulas) as Module 3 of the AEMP platform, keeping it **exactly identical** to the approved prototype `C:\Users\80128\Downloads\Drill string model.html`.

**Architecture:** The prototype is a fully self-contained single-file HTML app (own CSS, state, save/load `.json`, CSV exports, print, seeded demo data — no external deps besides Google Fonts). To guarantee pixel- and behavior-identical results, the file is copied **verbatim, unmodified** to `public/rig-string-builder.html` and embedded in the React shell through a small iframe wrapper module at route `/rig-string`, lazy-loaded like the Tubular module. The host appbar shows only the minimal "⌂ Modules" tab on this route (same treatment as `/home`) so users can navigate back; the embedded app's own appbar provides all module functions.

**Tech Stack:** React 18 + react-router-dom 6 + Vite 5 (existing app), Vitest 2 (jsdom) for tests. No new dependencies.

## Global Constraints

- Work happens inside `aemp-pid-bop-studio/` (the Vercel root dir). Repo root: `C:\projects\Faisal Rig WCE drowing`.
- **NEVER modify `public/rig-string-builder.html` after copying** — it must stay byte-identical to the source prototype. All integration lives in the wrapper.
- Do NOT edit `src/modules/tubular/**` or any WCE view — this is purely additive.
- Keep every new file under 500 lines (all new files here are < 60 lines).
- Read a file before editing it.
- Commit messages: conventional style `feat(rigstring): …`. Do NOT add a `Co-Authored-By` trailer (project rule).
- Run commands from `C:\projects\Faisal Rig WCE drowing\aemp-pid-bop-studio` unless a step says otherwise.
- Branch: create `feat/rig-string-builder-module` off `main` before Task 1 (use superpowers:using-git-worktrees if isolating).

---

### Task 1: Verbatim static asset + integrity test

**Files:**
- Create: `aemp-pid-bop-studio/public/rig-string-builder.html` (verbatim copy — never hand-edit)
- Test: `aemp-pid-bop-studio/src/modules/rigstring/asset.test.ts`

**Interfaces:**
- Produces: static asset served at URL path `/rig-string-builder.html` (Vite serves `public/` at site root in dev and build). Task 2 depends on this exact URL.

- [ ] **Step 1: Write the failing test**

Create `src/modules/rigstring/asset.test.ts`:

```ts
// Guards the verbatim prototype asset. The Rig String Builder module embeds
// public/rig-string-builder.html unchanged; these checks catch a missing,
// truncated, or accidentally re-encoded copy.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ASSET_PATH = fileURLToPath(
  new URL('../../../public/rig-string-builder.html', import.meta.url),
);

describe('rig-string-builder.html static asset', () => {
  const html = () => readFileSync(ASSET_PATH, 'utf8');

  it('exists and is the full prototype (not truncated)', () => {
    const t = html();
    expect(t.length).toBeGreaterThan(50_000);
    expect(t.trimStart().startsWith('<!doctype html>')).toBe(true);
    expect(t.trimEnd().endsWith('</html>')).toBe(true);
  });

  it('keeps the prototype title and all nine tabs', () => {
    const t = html();
    expect(t).toContain('<title>Rig String Builder — BHA · Pipe Tally · Ton-Mile</title>');
    for (const tab of ['bha', 'pipe', 'tm', 'daily', 'rot', 'pumps', 'trip', 'kill', 'form']) {
      expect(t).toContain(`data-tab="${tab}"`);
    }
  });

  it('keeps the self-contained engine (script + seed intact)', () => {
    const t = html();
    expect(t).toContain('"use strict"');
    expect(t).toContain('function killCompute()');
    expect(t).toContain("renderWell();seed();setTab('bha');renderSummary();");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/modules/rigstring`
Expected: FAIL — `ENOENT: no such file or directory … public/rig-string-builder.html`

- [ ] **Step 3: Copy the prototype verbatim**

Run (Git Bash) from `aemp-pid-bop-studio/`:

```bash
cp "/c/Users/80128/Downloads/Drill string model.html" public/rig-string-builder.html
cmp "/c/Users/80128/Downloads/Drill string model.html" public/rig-string-builder.html && echo IDENTICAL
```

Expected: `IDENTICAL` (byte-for-byte copy; no edits of any kind).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/modules/rigstring`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add public/rig-string-builder.html src/modules/rigstring/asset.test.ts
git commit -m "feat(rigstring): add verbatim Rig String Builder prototype as static asset"
```

---

### Task 2: RigStringModule iframe wrapper

**Files:**
- Create: `aemp-pid-bop-studio/src/modules/rigstring/RigStringModule.tsx`
- Test: `aemp-pid-bop-studio/src/modules/rigstring/RigStringModule.test.ts`

**Interfaces:**
- Consumes: static asset URL `/rig-string-builder.html` (Task 1).
- Produces: `default export RigStringModule(): JSX.Element` (React component, no props) and `export const RIG_STRING_SRC = '/rig-string-builder.html'`. Task 3 lazy-imports the default export from `./modules/rigstring/RigStringModule`.

- [ ] **Step 1: Write the failing test**

Create `src/modules/rigstring/RigStringModule.test.ts` (plain `.ts` — use `createElement`, no JSX, matching the repo's `.test.ts` convention):

```ts
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import RigStringModule, { RIG_STRING_SRC } from './RigStringModule';

describe('RigStringModule', () => {
  it('serves the prototype from the public root', () => {
    expect(RIG_STRING_SRC).toBe('/rig-string-builder.html');
  });

  it('renders a full-height iframe pointing at the verbatim asset', () => {
    const html = renderToStaticMarkup(createElement(RigStringModule));
    expect(html).toContain('<iframe');
    expect(html).toContain(`src="${RIG_STRING_SRC}"`);
    expect(html).toContain('title="Rig String Builder — BHA · Pipe Tally · Ton-Mile"');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/modules/rigstring/RigStringModule.test.ts`
Expected: FAIL — `Cannot find module './RigStringModule'` (or equivalent resolve error)

- [ ] **Step 3: Write the implementation**

Create `src/modules/rigstring/RigStringModule.tsx`:

```tsx
// ============================================================================
//  Rig String Builder — Module 3 (BHA · Pipe Tally · Ton-Mile · Daily ·
//  Rotating Hrs · Mud Pumps · Trip Sheet · Kill Sheet · Formulas).
//  The approved prototype is a self-contained single-file HTML app and is
//  kept verbatim at public/rig-string-builder.html; embedding it unmodified
//  in an iframe guarantees it stays exactly identical to the sign-off copy.
//  It is fully client-side: Save/Load work via .json downloads, CSV exports
//  and print run inside the frame. No sandbox attribute — it is first-party
//  same-origin content and needs downloads, confirm() and window.print().
// ============================================================================

export const RIG_STRING_SRC = '/rig-string-builder.html';

export default function RigStringModule() {
  return (
    <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
      <iframe
        src={RIG_STRING_SRC}
        title="Rig String Builder — BHA · Pipe Tally · Ton-Mile"
        style={{ flex: 1, width: '100%', border: 0, display: 'block' }}
      />
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/modules/rigstring`
Expected: PASS (both test files, 5 tests total)

- [ ] **Step 5: Commit**

```bash
git add src/modules/rigstring/RigStringModule.tsx src/modules/rigstring/RigStringModule.test.ts
git commit -m "feat(rigstring): iframe wrapper module embedding the verbatim prototype"
```

---

### Task 3: Route + appbar behavior in App.tsx

**Files:**
- Modify: `aemp-pid-bop-studio/src/App.tsx` (lazy import near line 19; `Shell` pathname flags near lines 105–106; new `<Route>` after the `/tubular/*` route near line 150)

**Interfaces:**
- Consumes: `default export` of `./modules/rigstring/RigStringModule` (Task 2).
- Produces: route `/rig-string` rendering the module. Task 4 links to `/rig-string`.

- [ ] **Step 1: Read `src/App.tsx`**, then make these three edits.

Edit A — below the existing `TubularModule` lazy import (line 19), add:

```tsx
// Rig String Builder is the verbatim single-file prototype in an iframe;
// the wrapper is tiny but lazy-loading keeps module boundaries uniform.
const RigStringModule = lazy(() => import('./modules/rigstring/RigStringModule'));
```

Edit B — in `Shell`, replace:

```tsx
  const inTubular = pathname.startsWith('/tubular');
  const inWce = !inTubular && pathname !== '/home';
```

with (keeps the minimal "⌂ Modules"-only header on `/rig-string`, same as `/home`, so users can navigate back while the embedded app supplies its own appbar):

```tsx
  const inTubular = pathname.startsWith('/tubular');
  const inRigString = pathname.startsWith('/rig-string');
  const inWce = !inTubular && !inRigString && pathname !== '/home';
```

Edit C — inside `<Routes>`, directly after the `/tubular/*` route, add:

```tsx
          <Route
            path="/rig-string"
            element={
              <Suspense fallback={<div className="placeholder">Loading Rig String Builder…</div>}>
                <RigStringModule />
              </Suspense>
            }
          />
```

- [ ] **Step 2: Verify types, tests and build**

Run: `npm run typecheck && npx vitest run && npm run build`
Expected: typecheck clean, all tests PASS, `vite build` succeeds and `dist/rig-string-builder.html` exists in the output listing.

- [ ] **Step 3: Manual smoke check in dev**

Run: `npm run dev`, open `http://localhost:5173/rig-string` (skip login if prompted).
Expected: the Rig String Builder renders full-width below the minimal host header, with its own dark appbar, seeded BHA table, all 9 tabs clickable, and the left String Summary rail. Confirm switching tabs and clicking "Save .json" (downloads a file) work. Stop the dev server.

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx
git commit -m "feat(rigstring): mount Rig String Builder module at /rig-string"
```

---

### Task 4: Home page module card

**Files:**
- Modify: `aemp-pid-bop-studio/src/views/HomeView.tsx` (add one `<ModuleCard>` after the Tubular card, near line 90)

**Interfaces:**
- Consumes: route `/rig-string` (Task 3) and the existing local `ModuleCard` component in `HomeView.tsx` (props: `to, icon, title, sub, note?, disabled?`).

- [ ] **Step 1: Read `src/views/HomeView.tsx`**, then add the card directly after the closing `/>` of the Tubular Fleet Management `<ModuleCard>`:

```tsx
          <ModuleCard
            to="/rig-string"
            icon="⛓"
            title="Rig String Builder"
            sub="BHA builder, pipe tally, ton-mile log, daily updates, rotating hours, mud pumps, trip sheet and kill sheet."
            note="Module 3 · Drill String"
          />
```

The card is **not** permission-gated and **not** disabled offline: the module is fully client-side (no Supabase), so it works in every mode — mirroring the always-available WCE card, not the gated Tubular card.

- [ ] **Step 2: Verify**

Run: `npm run typecheck && npx vitest run`
Expected: clean typecheck, all tests PASS.

Then: `npm run dev`, open `http://localhost:5173/home` — three cards show; clicking "Rig String Builder" lands on the working module. Stop the dev server.

- [ ] **Step 3: Commit**

```bash
git add src/views/HomeView.tsx
git commit -m "feat(rigstring): add Rig String Builder card to module home"
```

---

### Task 5: Final verification

- [ ] **Step 1: Full gate**

Run: `npm run build && npm test && npm run lint`
Expected: build succeeds, all tests PASS, lint reports no new errors in `src/modules/rigstring/`, `src/App.tsx`, `src/views/HomeView.tsx`.

- [ ] **Step 2: Byte-identity re-check** (protects against any accidental edit during the tasks)

```bash
cmp "/c/Users/80128/Downloads/Drill string model.html" public/rig-string-builder.html && echo IDENTICAL
```

Expected: `IDENTICAL`

- [ ] **Step 3: Finish the branch** — use superpowers:finishing-a-development-branch (merge/PR decision belongs to the user).

---

## Out of scope (deliberately)

- **React/TypeScript port of the prototype** — contradicts "exactly the same"; revisit only if the user later asks for cloud persistence or shared state with other modules.
- **Supabase persistence / roles** — the prototype's own Save/Load `.json` is the spec'd behavior.
- **Modifying the HTML** (theme sync, removing seed data, localStorage autosave) — all would break verbatim fidelity.
