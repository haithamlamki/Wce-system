# Tubular Module UX Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure the Tubular Fleet Management module: 8-tab nav (renamed + reordered), dashboard pie chart replacing the activity feed, a floating AI assistant, a topbar Data Entry quick-access button, Manual merged into Reference, and Transfer/Training deleted.

**Architecture:** All changes are inside `aemp-pid-bop-studio/src/modules/tubular/` (plus its scoped `tubular.css`). The nav is data-driven from `TUBULAR_TABS` in `lib/permissions.ts` (unit-tested), routes live in `TubularModule.tsx`, and every page is a self-contained view component — so each spec item maps to one or two files. No database or migration changes.

**Tech Stack:** React 18 + TypeScript, react-router-dom, Chart.js, Vitest, Vite. Supabase is the backend (untouched by this plan).

## Global Constraints

- Work in the app root `aemp-pid-bop-studio/` — all paths below are relative to it. Run commands from that directory.
- Create branch `feat/tubular-ux-refresh` from `main` (use superpowers:using-git-worktrees if isolating).
- Naming — use these exact strings everywhere, including in text bodies: **"Tubular Inventory"** (never "Fleet Inventory"), **"Master Sheet"** (never "Master Register"), **"Reference"** (single merged page).
- Final tab order (user-confirmed, Order Pipe kept): **Dashboard, Tubular Inventory, Master Sheet, Contracts, Asset Map, Order Pipe, Reference, Import**.
- Data Entry: removed from the tab nav; page stays at `/tubular/entry`, opened via a topbar button labeled **"✎ Data Entry"** below the System Online pill, visible only with the `data_entry` permission (same gate the old tab had).
- AI Assistant: floating collapsible panel on **all Tubular pages only** (not the P&ID module); the `/tubular/assistant` page is deleted.
- URLs do not change (`/tubular/inventory`, `/tubular/master` keep their paths — only labels change). Deleted pages' routes redirect: `/tubular/manual` → `/tubular/reference`, `/tubular/assistant` → `/tubular`.
- All CSS stays scoped under `.tubular-app` in `src/modules/tubular/tubular.css`.
- Keep files under 500 lines. No new documentation files.
- Test command: `npm test` (vitest run). Build check: `npm run build`. Both must pass at every commit.
- Commit style: `feat(tubular): …` / `refactor(tubular): …`. Do NOT add a `Co-Authored-By` trailer (project rule).

---

### Task 1: Navigation model — rename, reorder, prune tabs

The nav is generated from `TUBULAR_TABS`. Rewriting this one array renames Tubular Inventory / Master Sheet in the nav, removes the Data Entry / AI Assistant / Manual / Transfers / Training tabs, and sets the final order. Tabs are unit-tested, so this is a TDD task.

**Files:**
- Modify: `src/modules/tubular/lib/permissions.ts` (the `TUBULAR_TABS` array, ~lines 55–70)
- Modify: `src/modules/tubular/lib/permissions.test.ts` (the `visibleTabs gating` describe block)
- Modify: `src/modules/tubular/components/shell/TubularTabNav.tsx` (header comment only)

**Interfaces:**
- Consumes: existing `TubularTab` interface, `hasPermission`, `canAccessModule` (unchanged).
- Produces: `TUBULAR_TABS: TubularTab[]` with exactly 8 entries in the order below. Later tasks (7, 8) rely on `hasPermission(role, granted, 'data_entry')` still existing unchanged.

- [ ] **Step 1: Rewrite the failing tests**

In `src/modules/tubular/lib/permissions.test.ts`, replace the entire `describe('visibleTabs gating', …)` block (currently the last block in the file) with:

```ts
describe('visibleTabs gating', () => {
  it('no module access -> no tabs at all', () => {
    expect(visibleTabs('field', none)).toEqual([]);
  });

  it('unit viewer sees general tabs but not Master Sheet or Import', () => {
    const tabs = visibleTabs('field', new Set(['view'])).map((t) => t.label);
    expect(tabs).toEqual(['Dashboard', 'Tubular Inventory', 'Contracts', 'Asset Map', 'Order Pipe', 'Reference']);
  });

  it('view_fleet grant adds the Master Sheet tab', () => {
    const tabs = visibleTabs('field', new Set(['view', 'view_fleet'])).map((t) => t.label);
    expect(tabs).toContain('Master Sheet');
  });

  it('privileged users see all 8 tabs in the agreed order', () => {
    expect(visibleTabs('manager', none).map((t) => t.label)).toEqual([
      'Dashboard', 'Tubular Inventory', 'Master Sheet', 'Contracts',
      'Asset Map', 'Order Pipe', 'Reference', 'Import',
    ]);
  });

  it('retired tabs and old names are gone', () => {
    const labels = visibleTabs('admin', none).map((t) => t.label);
    for (const gone of ['Data Entry', 'AI Assistant', 'Manual', 'Transfers', 'Training',
      'Fleet Inventory', 'Master Register']) {
      expect(labels).not.toContain(gone);
    }
  });
});
```

(The old `unit viewer sees general tabs but not Data Entry or Master Register` and `data_entry grant adds the Data Entry tab` tests are deleted by this replacement — Data Entry is no longer a tab. The first `describe` block about permissions stays untouched.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/modules/tubular/lib/permissions.test.ts`
Expected: FAIL — labels still say `Fleet Inventory`, order wrong, retired tabs present.

- [ ] **Step 3: Rewrite `TUBULAR_TABS`**

In `src/modules/tubular/lib/permissions.ts`, replace the `TUBULAR_TABS` constant and its doc comment with:

```ts
/** Module navigation — 8 tabs (2026-08 UX refresh). Data Entry opens from the
 *  topbar quick-access button, the AI Assistant is a floating panel on every
 *  page, and Manual is merged into Reference. */
export const TUBULAR_TABS: TubularTab[] = [
  { to: '/tubular', label: 'Dashboard', icon: '▦', num: '01', requires: null },
  { to: '/tubular/inventory', label: 'Tubular Inventory', icon: '⊟', num: '02', requires: null },
  { to: '/tubular/master', label: 'Master Sheet', icon: '▥', num: '03', requires: 'view_fleet' },
  { to: '/tubular/contracts', label: 'Contracts', icon: '▤', num: '04', requires: null },
  { to: '/tubular/map', label: 'Asset Map', icon: '◎', num: '05', requires: null },
  { to: '/tubular/orders', label: 'Order Pipe', icon: '⛟', num: '06', requires: null },
  { to: '/tubular/reference', label: 'Reference', icon: '◐', num: '07', requires: null },
  { to: '/tubular/import', label: 'Import', icon: '⬆', num: '08', requires: 'import' },
];
```

Leave `TUBULAR_PERMISSIONS`, `hasPermission`, `canAccessModule`, `visibleTabs` unchanged (the `data_entry` permission is still used by the DB and by Task 7's button).

- [ ] **Step 4: Update the TabNav header comment**

In `src/modules/tubular/components/shell/TubularTabNav.tsx`, replace the lines of the header comment that read "Routing via NavLink (same paths as before); the three extra platform tabs (Master/Transfers/Import) continue the numbering." with "Routing via NavLink; 8 tabs numbered 01–08 (2026-08 UX refresh order)." (Keep the rest of the comment.) No code changes — the component renders whatever `visibleTabs` returns, with no per-tab gaps, so spec item 8's "consistent spacing" is automatic.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/modules/tubular/lib/permissions.test.ts`
Expected: PASS (all tests).

- [ ] **Step 6: Commit**

```bash
git add src/modules/tubular/lib/permissions.ts src/modules/tubular/lib/permissions.test.ts src/modules/tubular/components/shell/TubularTabNav.tsx
git commit -m "feat(tubular): 8-tab nav - rename Tubular Inventory/Master Sheet, new order, prune retired tabs"
```

---

### Task 2: Delete the Transfer and Training modules

**Files:**
- Modify: `src/modules/tubular/TubularModule.tsx` (remove 2 imports + 2 routes)
- Delete: `src/modules/tubular/views/MovementsView.tsx` (this IS the "Transfer" page — label "Transfers", route `/tubular/transfers`)
- Delete: `src/modules/tubular/views/TrainingView.tsx`

**Interfaces:**
- Consumes: nothing new.
- Produces: `/tubular/transfers` and `/tubular/training` now fall through to the existing `*` Not-Found route. Database movement tables/RPCs (`tubular_movements`, `complete_movement`, `cancel_movement`) are NOT touched — only the UI is deleted. The `approve_movements` permission stays in `TUBULAR_PERMISSIONS` (DB parity).

- [ ] **Step 1: Remove routes and imports**

In `src/modules/tubular/TubularModule.tsx`:
- Delete line `import MovementsView from './views/MovementsView';`
- Delete line `import TrainingView from './views/TrainingView';`
- Delete line `<Route path="transfers" element={<MovementsView />} />`
- Delete line `<Route path="training" element={<TrainingView />} />`

- [ ] **Step 2: Delete the view files**

```bash
git rm src/modules/tubular/views/MovementsView.tsx src/modules/tubular/views/TrainingView.tsx
```

- [ ] **Step 3: Verify nothing else references them**

Run: `grep -rn "MovementsView\|TrainingView" src/`
Expected: no output. (Other "movement" hits — `DataEntryView` form fields, `ContractsView` certificate, `permissions.ts` — are data-entry/DB concepts, not the deleted page; leave them.)

- [ ] **Step 4: Tests + build pass**

Run: `npm test && npm run build`
Expected: all tests PASS; `tsc -b` build succeeds (would fail on dangling imports).

- [ ] **Step 5: Commit**

```bash
git add -A src/modules/tubular
git commit -m "feat(tubular): remove Transfers and Training pages, routes and nav entries"
```

---

### Task 3: Merge Manual into Reference

One "Reference" page: the API RP 7G tables first, then the per-page guide sections (from ManualView, with text updated for the new UX), then the FAQ, with a jump-to select. The old duplicated "How To Use This System" list is dropped (the guide sections cover it).

**Files:**
- Modify: `src/modules/tubular/views/ReferenceView.tsx` (full rewrite below)
- Delete: `src/modules/tubular/views/ManualView.tsx`
- Modify: `src/modules/tubular/TubularModule.tsx` (remove ManualView import; redirect route)

**Interfaces:**
- Consumes: nothing from other tasks (Task 1 already removed the Manual tab).
- Produces: `/tubular/manual` redirects to `/tubular/reference`. `ReferenceView` remains the default export at the same path.

- [ ] **Step 1: Rewrite ReferenceView.tsx**

Replace the entire content of `src/modules/tubular/views/ReferenceView.tsx` with:

```tsx
// ============================================================================
//  Reference — merged Reference + User Manual page (2026-08 UX refresh):
//  API RP 7G tables (classification, band marking, inspection zones, related
//  standards) followed by the per-page system guide and the FAQ, with a
//  jump-to select. Guide text reflects the current UX (floating assistant,
//  topbar Data Entry button, dashboard pie chart).
// ============================================================================
import { useState } from 'react';

const CLASSES: Array<[string, string, string, string]> = [
  ['Premium', '≥ 80% of nominal', '≤ 3% of nominal OD', '#fff'],
  ['Class 2', '≥ 70% of nominal', '≤ 4% of nominal OD', '#facc15'],
  ['Class 3', 'Exceeds Class 2 limits', 'N/A', '#fb923c'],
  ['Scrap', 'No longer fit for service', 'N/A', '#ef4444'],
];

const BANDS: Array<[string, string, string, string]> = [
  ['Premium', 'Two White Bands', 'One centre punch', '#fff'],
  ['Class 2', 'One Yellow Band', 'Two centre punches', '#facc15'],
  ['Class 3', 'One Orange Band', 'Three centre punches', '#fb923c'],
  ['Scrap', 'One Red Band', '—', '#ef4444'],
];

const ZONES: Array<[string, string, string]> = [
  ['Zone A', 'Pipe body', 'Wall thickness & OD wear'],
  ['Zone B', 'Tool joint', 'Box & pin condition'],
  ['Zone C', 'Transition / upset area', 'Inspect carefully'],
];

const STANDARDS: Array<[string, string]> = [
  ['API RP 7G', 'Used drill pipe inspection & classification'],
  ['API Spec 5D', 'New drill pipe specifications'],
  ['API Spec 7', 'Drill collar & rotary drill stem dimensions'],
  ['API Std 5CT', 'Casing & tubing classification'],
];

interface GuideSection { id: string; ico: string; title: string; body: string[] }

const SECTIONS: GuideSection[] = [
  {
    id: 'man-dashboard', ico: '▦', title: 'Dashboard',
    body: [
      'The Dashboard is the live fleet position. Six KPI cards summarise units reporting, contracted quantity and the API RP 7G class mix; three live cards track pipe orders, contracts needing attention and fleet utilization (serviceable ÷ contracted).',
      'Charts break the fleet down: joints per rig (pie), tubular type, class mix, unit and contract variance. The Items Requiring Attention table lists every line that is short of contract, holds scrap, or has joints flagged for inspection.',
      'Use the Filter select to scope everything to a single Rig/Hoist. Figures are computed from the database on every refresh — nothing is hardcoded.',
    ],
  },
  {
    id: 'man-fleet', ico: '⊟', title: 'Tubular Inventory',
    body: [
      'Fleet-Wide view shows a card per unit (click a card to drill into that unit) above the full classification table. Single Unit view scopes the table to one Rig/Hoist.',
      'Each row shows the contract quantity, the four API RP 7G classes, needs-inspection count, computed on-board total, variance and a status badge. The Tubular Filter narrows by category.',
    ],
  },
  {
    id: 'man-entry', ico: '✎', title: 'Data Entry',
    body: [
      'Open Data Entry with the ✎ Data Entry button under the System Online indicator in the top bar (requires the data-entry permission).',
      'Work top to bottom: ① choose your Rig/Hoist, date and tubular; ② enter the classification quantities; ③ record movements, rental date and remarks; then Save Record. Each save is a full audited submission.',
      'On Board Total is always computed (Premium + Class 2 + Class 3 + Scrap) and cannot be typed; Contractually Less shows OK or the shortfall of Premium + Class 2 against contract.',
      'The Existing Records table lists your unit\'s current rows — Edit loads a row back into the form, Delete archives it (history is never destroyed). The Batch Grid Mode toggle opens the Excel-style sheet for whole-month entry.',
      'Spreadsheet Sync parses the monthly workbook; staged imports are previewed and committed on the Import tab with a reconciliation report.',
    ],
  },
  {
    id: 'man-chat', ico: '◈', title: 'AI Assistant',
    body: [
      'The assistant floats at the bottom-right of every Tubular page — click the ◈ bubble to expand it, and minimise it when you\'re done. It never covers the page content while collapsed.',
      'Ask about totals, shortfalls, scrap, inspections, rig comparisons or a specific unit. Every number in an answer is computed from the records your account is authorized to see — the assistant never estimates.',
      'The assistant is read-only; make changes through Data Entry.',
    ],
  },
  {
    id: 'man-contracts', ico: '▤', title: 'Contracts',
    body: [
      'Each card shows a rig\'s client contract with its committed tubular lines. On Hand counts serviceable stock (Premium + Class 2) only; per-line status shows OK, SHORT or MISSING, and the card badge rolls up compliance including expiry (≤30 days shows EXPIRING).',
      'Administrators create and edit contracts through the modal. Draft contracts can be deleted; anything that has been active is archived instead so the history is preserved.',
      'The certificate utility renders a printable classification statement for any unit + tubular from the live records.',
    ],
  },
  {
    id: 'man-map', ico: '◎', title: 'Asset Map',
    body: [
      'Shows Abraj sites, logistics points, rigs and hoists across Oman. Locations are shared database records; administrators can add, edit or remove them (Admin Mode toggle, then click the map or use a marker popup).',
      'The distance calculator, trip cost planner and distance matrix use straight-line (haversine) distances — operational coordinates are never sent to external routing services.',
    ],
  },
  {
    id: 'man-orders', ico: '⛟', title: 'Order Pipe & Tracking',
    body: [
      'The fleet pool lists serviceable stock (Premium + Class 2, minus existing holds) available outside your rig. Submit a request with quantity and priority; an authorized approver reserves stock, and the yard/logistics team advances the order through Picked at Yard and In Transit.',
      'Every stage change is a real, timestamped action by a responsible person — orders never advance automatically. Confirm delivery when the pipe arrives; that is what moves stock onto your rig\'s records. Cancelling releases any reserved stock.',
    ],
  },
  {
    id: 'man-theme', ico: '☀/☾', title: 'Theme',
    body: [
      'Use the topbar toggle to pick Light, Dark or Auto. Auto follows your device\'s light/dark preference. The choice is remembered on this device and also applies to the P&ID / BOP Studio module.',
    ],
  },
];

const FAQ: Array<[string, string]> = [
  ['Where is my data stored?', 'In the shared cloud database (Supabase) with per-unit authorization and a full audit trail — not in your browser. Every device sees the same data.'],
  ['Why can\'t I see a unit or page?', 'Visibility follows your account\'s permissions and unit assignments. Ask an administrator to grant access or assign your Rig/Hoist.'],
  ['Can I undo an edit?', 'Every save is kept as an immutable submission, and deleted rows are archived rather than destroyed. An administrator can restore prior values from the audit history.'],
  ['Do orders advance automatically?', 'No. Every stage — approval, picking, transit, delivery — is an explicit action by an authorized person, with a real timestamp.'],
  ['Do map distances need internet routing services?', 'No. Distances are straight-line (haversine) computed locally; only standard map tiles are fetched. Coordinates never leave the system.'],
];

function bandStyle(color: string): React.CSSProperties {
  return color === '#fff' ? { background: '#fff', borderColor: '#666' } : { background: color };
}

export default function ReferenceView() {
  const [jump, setJump] = useState('');

  const jumpTo = (id: string) => {
    setJump(id);
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <section className="view" id="view-ref">
      <div className="section-head">
        <div className="section-title">Reference</div>
        <div className="section-sub">API RP 7G standards · system guide &amp; FAQ</div>
      </div>

      <div className="unit-bar">
        <span className="lbl">Jump to</span>
        <select id="ref-jump" value={jump || 'ref-standards'} onChange={(e) => jumpTo(e.target.value)}>
          <option value="ref-standards">API RP 7G Standards</option>
          {SECTIONS.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
          <option value="man-faq">FAQ &amp; Troubleshooting</option>
        </select>
      </div>

      <div className="ref-grid" id="ref-standards">
        <div className="ref-card">
          <h4>Drill Pipe Classification (API RP 7G)</h4>
          <table className="ref-class-tbl">
            <thead><tr><th>Class</th><th>Wall Thickness</th><th>Max OD Wear</th></tr></thead>
            <tbody>
              {CLASSES.map(([cls, wall, od, color]) => (
                <tr key={cls}><td><span className="color-band" style={bandStyle(color)} />{cls}</td><td>{wall}</td><td>{od}</td></tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="ref-card">
          <h4>Band Marking Convention</h4>
          <table>
            <thead><tr><th>Class</th><th>Band Marking</th><th>Punch Marks</th></tr></thead>
            <tbody>
              {BANDS.map(([cls, band, punch, color]) => (
                <tr key={cls}><td><span className="color-band" style={bandStyle(color)} />{cls}</td><td>{band}</td><td>{punch}</td></tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="ref-card">
          <h4>Inspection Zones</h4>
          <table>
            <thead><tr><th>Zone</th><th>Area Covered</th><th>Notes</th></tr></thead>
            <tbody>
              {ZONES.map(([zone, area, notes]) => (
                <tr key={zone}><td>{zone}</td><td>{area}</td><td>{notes}</td></tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="ref-card">
          <h4>Related Standards</h4>
          <table>
            <thead><tr><th>Standard</th><th>Scope</th></tr></thead>
            <tbody>
              {STANDARDS.map(([std, scope]) => (
                <tr key={std}><td>{std}</td><td>{scope}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="section-head" style={{ marginTop: 24 }}>
        <div className="section-title" style={{ fontSize: 15 }}>System Guide</div>
        <div className="section-sub">A guide to every page in the Abraj Tubular Inventory system</div>
      </div>

      {SECTIONS.map((s) => (
        <div className="ref-card" id={s.id} key={s.id} style={{ marginBottom: 14 }}>
          <h4>{s.ico} {s.title}</h4>
          {s.body.map((p, i) => <p key={i} style={{ marginBottom: 8 }}>{p}</p>)}
        </div>
      ))}

      <div className="ref-card" id="man-faq">
        <h4>FAQ &amp; Troubleshooting</h4>
        <table>
          <thead><tr><th>Question</th><th>Answer</th></tr></thead>
          <tbody>
            {FAQ.map(([q, a]) => (
              <tr key={q}><td style={{ whiteSpace: 'normal' }}>{q}</td><td style={{ whiteSpace: 'normal' }}>{a}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Redirect the manual route and drop the import**

In `src/modules/tubular/TubularModule.tsx`:
- Change the react-router import to include `Navigate`: `import { Navigate, Route, Routes } from 'react-router-dom';`
- Delete line `import ManualView from './views/ManualView';`
- Replace `<Route path="manual" element={<ManualView />} />` with `<Route path="manual" element={<Navigate to="/tubular/reference" replace />} />`

- [ ] **Step 3: Delete ManualView**

```bash
git rm src/modules/tubular/views/ManualView.tsx
```

- [ ] **Step 4: Tests + build pass**

Run: `npm test && npm run build`
Expected: PASS / build succeeds. Also run `grep -rn "ManualView" src/` — expected: no output.

- [ ] **Step 5: Commit**

```bash
git add -A src/modules/tubular
git commit -m "feat(tubular): merge Manual into Reference page with jump-to guide and FAQ"
```

---

### Task 4: Rename Fleet Inventory → Tubular Inventory (view + all internal references)

Task 1 already renamed the tab label. This task renames the view file, component, on-page titles, and every remaining internal reference.

**Files:**
- Rename: `src/modules/tubular/views/FleetInventoryView.tsx` → `src/modules/tubular/views/TubularInventoryView.tsx`
- Modify: `src/modules/tubular/TubularModule.tsx` (import + route element)
- Modify: `src/modules/tubular/lib/records.ts` (one comment)

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: default export `TubularInventoryView` at the same route `/tubular/inventory`.

- [ ] **Step 1: Rename the file**

```bash
git mv src/modules/tubular/views/FleetInventoryView.tsx src/modules/tubular/views/TubularInventoryView.tsx
```

- [ ] **Step 2: Rename inside the file**

In `src/modules/tubular/views/TubularInventoryView.tsx`:
- `export default function FleetInventoryView()` → `export default function TubularInventoryView()`
- Replace every `Fleet Inventory` string with `Tubular Inventory` (header comment, the empty-state `<div className="title">Fleet Inventory</div>`, and the `<div className="section-title">Fleet Inventory</div>`). Verify with `grep -n "Fleet Inventory" src/modules/tubular/views/TubularInventoryView.tsx` → no output.
- Do NOT rename the "Fleet-Wide" view-mode toggle or "Fleet Overview"/"Fleet Class Mix"/fleet-utilization wording elsewhere — "fleet" as a plain word is fine; only the module name "Fleet Inventory" is renamed.

- [ ] **Step 3: Update the module import**

In `src/modules/tubular/TubularModule.tsx`:
- `import FleetInventoryView from './views/FleetInventoryView';` → `import TubularInventoryView from './views/TubularInventoryView';`
- `<Route path="inventory" element={<FleetInventoryView />} />` → `<Route path="inventory" element={<TubularInventoryView />} />`

- [ ] **Step 4: Update the records.ts comment**

In `src/modules/tubular/lib/records.ts` (~line 124): `/** All records visible to the caller (RLS-scoped) for Fleet Inventory. */` → `/** All records visible to the caller (RLS-scoped) for Tubular Inventory. */`

- [ ] **Step 5: Verify, test, build**

Run: `grep -rn "Fleet Inventory\|FleetInventoryView" src/` — expected: no output.
Run: `npm test && npm run build` — expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -A src/modules/tubular
git commit -m "refactor(tubular): rename Fleet Inventory to Tubular Inventory throughout"
```

---

### Task 5: Rename Master Register → Master Sheet (view + all internal references)

**Files:**
- Rename: `src/modules/tubular/views/MasterRegisterView.tsx` → `src/modules/tubular/views/MasterSheetView.tsx`
- Modify: `src/modules/tubular/TubularModule.tsx` (import + route element)

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: default export `MasterSheetView` at the same route `/tubular/master`.

- [ ] **Step 1: Rename the file**

```bash
git mv src/modules/tubular/views/MasterRegisterView.tsx src/modules/tubular/views/MasterSheetView.tsx
```

- [ ] **Step 2: Rename inside the file**

In `src/modules/tubular/views/MasterSheetView.tsx`:
- `export default function MasterRegisterView()` → `export default function MasterSheetView()`
- Replace every `Master Register` string with `Master Sheet` (header comment, loading empty-state title, `<div className="section-title">Master Register</div>`, and any export-filename or badge strings found by grep). Verify with `grep -n "Master Register" src/modules/tubular/views/MasterSheetView.tsx` → no output.

- [ ] **Step 3: Update the module import**

In `src/modules/tubular/TubularModule.tsx`:
- `import MasterRegisterView from './views/MasterRegisterView';` → `import MasterSheetView from './views/MasterSheetView';`
- `<Route path="master" element={<MasterRegisterView />} />` → `<Route path="master" element={<MasterSheetView />} />`

- [ ] **Step 4: Verify, test, build**

Run: `grep -rn "Master Register\|MasterRegisterView" src/` — expected: no output.
Run: `npm test && npm run build` — expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A src/modules/tubular
git commit -m "refactor(tubular): rename Master Register to Master Sheet throughout"
```

---

### Task 6: Dashboard — replace Live Activity Feed with a Joints-per-Rig pie chart

Remove the feed panel and its data plumbing (submission/order-event queries existed only for the feed); add a Chart.js pie of on-board joints by unit in the same full-width slot. The existing four charts, KPI cards and attention table stay.

**Files:**
- Modify: `src/modules/tubular/views/TubularDashboardView.tsx`

**Interfaces:**
- Consumes: existing `aggregate` from `../lib/calc`, `unitById` map, Chart.js already in deps.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Update Chart.js registration**

At the top of `TubularDashboardView.tsx`, add `PieController` to the chart.js import list and to the `Chart.register(...)` call:

```ts
import {
  Chart, BarController, BarElement, DoughnutController, PieController, ArcElement,
  CategoryScale, LinearScale, Legend, Tooltip,
} from 'chart.js';
```
```ts
Chart.register(BarController, BarElement, DoughnutController, PieController, ArcElement, CategoryScale, LinearScale, Legend, Tooltip);
```

- [ ] **Step 2: Remove the feed plumbing**

Still in `TubularDashboardView.tsx`:
- Delete the `interface FeedItem { at: string; text: string }` declaration.
- Delete the state line `const [feed, setFeed] = useState<FeedItem[]>([]);`
- In `load()`, replace the whole `if (supabase) { … }` block with this smaller version (the `subs`/`events` queries and the `items`/`unitName` feed assembly are gone; orders/contracts handling is unchanged):

```ts
      if (supabase) {
        const [o, c] = await Promise.all([
          supabase.from('pipe_orders').select('status'),
          supabase.from('tubular_contracts').select('id, status, end_date'),
        ]);
        setOrders((o.data ?? []) as Array<{ status: string }>);
        const cl = (c.data ?? []) as Array<{ status: string; end_date: string | null }>;
        const attn = cl.filter((x) => x.status === 'expired'
          || (x.status === 'active' && x.end_date && (new Date(x.end_date).getTime() - Date.now()) / 86400000 <= 30)).length;
        setContractsAttn({ total: cl.length, attn });
      }
```

- Change the `useCallback` dependency array of `load` from `[units]` to `[]` (the feed's `unitName` lookup was the only use of `units` inside `load`).
- Update the file's header comment: "6 KPI cards, 3 live cards, activity feed, 4 Chart.js charts, attention table" → "6 KPI cards, 3 live cards, 5 Chart.js charts (incl. joints-per-rig pie), attention table" and drop the "activity feed from real submissions & order events" sentence.

- [ ] **Step 3: Add the pie chart**

- Add a ref next to the other chart refs: `const chPieRef = useRef<HTMLCanvasElement>(null);`
- Add a color palette constant next to `GRID`/`TICK` (module scope):

```ts
const PIE_COLORS = ['#d97706', '#3b82f6', '#10b981', '#f1f5f9', '#facc15', '#fb923c',
  '#ef4444', '#a855f7', '#14b8a6', '#e879f9', '#94a3b8', '#eab308'];
```

- Inside the charts `useEffect`, the `byUnit`/`unitAgg` aggregation already exists (it feeds the "Inventory by Unit" bar chart). Immediately after the existing `if (chUnitRef.current) { … }` block, add:

```ts
    if (chPieRef.current) {
      chartsRef.current.push(new Chart(chPieRef.current, {
        type: 'pie',
        data: {
          labels: unitAgg.map((x) => x.unit!.name),
          datasets: [{
            data: unitAgg.map((x) => x.t.onBoard),
            backgroundColor: unitAgg.map((_, i) => PIE_COLORS[i % PIE_COLORS.length]),
            borderColor: '#0f141c', borderWidth: 1.5,
          }],
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: {
            legend: { position: 'right', labels: { boxWidth: 10, padding: 6, font: { size: 9.5 } } },
            tooltip: {
              ...TOOLTIP_STYLE,
              callbacks: {
                label: (ctx) => {
                  const total = (ctx.dataset.data as number[]).reduce((a, b) => a + b, 0);
                  const v = ctx.parsed as number;
                  return ` ${ctx.label}: ${v.toLocaleString()} joints (${total ? ((v / total) * 100).toFixed(1) : 0}%)`;
                },
              },
            },
          },
        },
      }));
    }
```

- [ ] **Step 4: Swap the JSX panel**

Replace the entire Live Activity Feed panel (the `<div className="panel" style={{ marginBottom: 24 }}>` block containing `<h3>Live Activity Feed</h3>` and `#dash-activity-feed`) with:

```tsx
      <div className="panel" style={{ marginBottom: 24 }}>
        <div className="panel-head">
          <h3>Joints per Rig</h3>
          <span className="badge">Total on-board joints by unit</span>
        </div>
        <div className="chart-wrap tall"><canvas id="ch-jointsperrig" ref={chPieRef} /></div>
      </div>
```

- [ ] **Step 5: Verify, test, build**

Run: `grep -rn "Live Activity\|dash-activity-feed\|FeedItem" src/` — expected: no output.
Run: `npm test && npm run build` — expected: PASS.
Run: `npm run dev`, open `http://localhost:5173/tubular` — the pie renders where the feed was, tooltips show "N joints (x%)", the other 4 charts unchanged, no console errors. Stop the dev server.

- [ ] **Step 6: Commit**

```bash
git add src/modules/tubular/views/TubularDashboardView.tsx
git commit -m "feat(tubular): replace dashboard activity feed with joints-per-rig pie chart"
```

---

### Task 7: Topbar Data Entry quick-access button

A one-click "✎ Data Entry" button directly below the System Online status pill, visible only to users holding the `data_entry` permission (the same gate the removed tab had).

**Files:**
- Modify: `src/modules/tubular/components/shell/TubularTopbar.tsx`
- Modify: `src/modules/tubular/tubular.css` (append 3 rules)

**Interfaces:**
- Consumes: `hasPermission(role, granted, 'data_entry')` from `../../lib/permissions` (unchanged since Task 1); `granted: ReadonlySet<string>` from `useTubular()`; `role` from `useAuth()` (already imported).
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Add the button**

In `src/modules/tubular/components/shell/TubularTopbar.tsx`:
- Add import: `import { hasPermission } from '../../lib/permissions';`
- Destructure `granted` from the tubular context: `const { units, granted } = useTubular();`
- Wrap the existing status pill in a column and add the gated link below it — replace the current `<div className="status-pill" …>…</div>` block with:

```tsx
        <div className="status-col">
          <div className="status-pill" title={session ? 'Connected to the cloud database' : 'Not signed in'}
            role={session ? undefined : 'button'}
            onClick={session ? () => void signOut() : undefined}
            style={session ? { cursor: 'pointer' } : undefined}>
            <span className="dot" />
            <span className="txt">{session ? 'System Online' : 'Offline'}</span>
          </div>
          {hasPermission(role, granted, 'data_entry') && (
            <Link to="/tubular/entry" className="quick-entry" title="Open Data Entry">✎ Data Entry</Link>
          )}
        </div>
```

(`Link` is already imported in this file.)

- [ ] **Step 2: Style it**

Append to `src/modules/tubular/tubular.css` (keep everything scoped under `.tubular-app`; before writing, read the existing `.tubular-app .status-pill` rule and reuse its font-size/radius scale so the button visually matches the pill):

```css
/* --- topbar quick access (below the status pill) -------------------------- */
.tubular-app .status-col{display:flex;flex-direction:column;align-items:stretch;gap:6px}
.tubular-app .quick-entry{display:flex;align-items:center;justify-content:center;gap:5px;padding:4px 12px;border-radius:999px;font-size:11px;font-weight:700;letter-spacing:.3px;background:var(--copper-2,#d97706);color:#10141b;text-decoration:none;white-space:nowrap}
.tubular-app .quick-entry:hover{filter:brightness(1.1)}
```

- [ ] **Step 3: Verify, test, build**

Run: `npm test && npm run build` — expected: PASS.
Run: `npm run dev`, open `/tubular` as an admin (privileged → implicit `data_entry`): the button appears directly below System Online and one click lands on the Data Entry page. Check both light and dark themes. Stop the dev server.

- [ ] **Step 4: Commit**

```bash
git add src/modules/tubular/components/shell/TubularTopbar.tsx src/modules/tubular/tubular.css
git commit -m "feat(tubular): topbar Data Entry quick-access button below System Online pill"
```

---

### Task 8: Floating AI Assistant (replaces the /tubular/assistant page)

A fixed bottom-right ◈ bubble on every Tubular page; clicking it expands a chat panel using the existing deterministic engine (`lib/assistant.ts`). The full-page AssistantView is deleted and its route redirects home. Toasts move up so the two floating elements don't overlap (spec item 9).

**Files:**
- Create: `src/modules/tubular/components/FloatingAssistant.tsx`
- Modify: `src/modules/tubular/TubularModule.tsx` (render it; remove AssistantView import; redirect route)
- Delete: `src/modules/tubular/views/AssistantView.tsx`
- Modify: `src/modules/tubular/tubular.css` (append panel rules; bump `.toast-wrap` bottom offset)

**Interfaces:**
- Consumes: `answer(question, ctx)` and `type AssistantAnswer` from `../lib/assistant`; `fetchCatalog`, `fetchVisibleRecords`, `type CatalogItem`, `type TubularRecordRow` from `../lib/records`; `useTubular()` giving `{ enabled, canAccess, units }`. Existing chat CSS classes `.msg`, `.avatar`, `.bubble`, `.typing-indicator`, `.suggest`, `.ai-dot` (already in tubular.css).
- Produces: `FloatingAssistant` default export, rendered once in the module shell.

- [ ] **Step 1: Create the component**

Create `src/modules/tubular/components/FloatingAssistant.tsx`:

```tsx
// ============================================================================
//  Floating AI Assistant — collapsible bottom-right chat bubble available on
//  every Tubular page (replaces the old /tubular/assistant page). Same
//  deterministic engine (lib/assistant.ts) over the caller's RLS-scoped
//  records; data loads lazily on first open.
// ============================================================================
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTubular } from '../state/TubularContext';
import { fetchCatalog, fetchVisibleRecords, type CatalogItem, type TubularRecordRow } from '../lib/records';
import { answer, type AssistantAnswer } from '../lib/assistant';

interface ChatEntry { who: 'user' | 'ai'; text: string; rows?: AssistantAnswer['rows']; time: string }

const SUGGESTIONS = ['Fleet summary', 'Which rigs have scrap?', 'Which rigs are short of stock?', 'What needs inspection?'];

const now = () => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

export default function FloatingAssistant() {
  const { enabled, canAccess, units } = useTubular();
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [records, setRecords] = useState<TubularRecordRow[]>([]);
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [chat, setChat] = useState<ChatEntry[]>([{
    who: 'ai', time: now(),
    text: 'Hello — ask me anything about your tubular fleet data: counts, classifications, surplus/shortfall, which rigs have what.',
  }]);
  const [input, setInput] = useState('');
  const [typing, setTyping] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || loaded) return;
    setLoaded(true);
    void Promise.all([fetchCatalog(), fetchVisibleRecords()])
      .then(([c, r]) => { setCatalog(c); setRecords(r); })
      .catch(() => undefined);
  }, [open, loaded]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [chat, typing, open]);

  const ctx = useMemo(() => ({
    records, catalog,
    unitNames: new Map(units.map((u) => [u.id, u.name])),
  }), [records, catalog, units]);

  const ask = (q?: string) => {
    const question = (q ?? input).trim();
    if (!question || typing) return;
    setChat((c) => [...c, { who: 'user', text: question, time: now() }]);
    setInput('');
    setTyping(true);
    const a = answer(question, ctx);
    setTimeout(() => {
      setTyping(false);
      setChat((c) => [...c, { who: 'ai', text: a.text, rows: a.rows, time: now() }]);
    }, 300);
  };

  const onKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      ask();
    }
  };

  if (!enabled || !canAccess) return null;

  return (
    <>
      {open && (
        <div className="ai-float" role="dialog" aria-label="AI Assistant">
          <div className="ai-float-head">
            <div className="title"><span className="ai-dot" />Abraj Inventory Assistant</div>
            <button className="ai-float-min" onClick={() => setOpen(false)} aria-label="Minimize assistant">—</button>
          </div>
          <div className="ai-float-body">
            {chat.map((m, i) => (
              <div key={i} className={`msg ${m.who}`}>
                <div className="avatar">{m.who === 'ai' ? 'A' : 'U'}</div>
                <div className="bubble">
                  <span style={{ whiteSpace: 'pre-line' }}>{m.text}</span>
                  {m.rows && m.rows.length > 0 && (
                    <table>
                      <thead><tr><th>Unit</th><th>Tubular</th><th>Detail</th></tr></thead>
                      <tbody>
                        {m.rows.map((r, j) => (
                          <tr key={j}>
                            <td className="mono">{r.unit}</td>
                            <td>{r.description}</td>
                            <td className="mono">{r.detail}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            ))}
            {typing && (
              <div className="msg ai">
                <div className="avatar">A</div>
                <div className="typing-indicator"><span /><span /><span /></div>
              </div>
            )}
            <div ref={endRef} />
          </div>
          <div className="ai-float-suggest">
            {SUGGESTIONS.map((s) => (
              <button key={s} className="suggest" onClick={() => ask(s)}>{s}</button>
            ))}
          </div>
          <div className="ai-float-input">
            <textarea rows={1} value={input}
              placeholder="Ask about tubulars, rigs, classes…"
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKey} />
            <button disabled={typing || !input.trim()} onClick={() => ask()}>Send</button>
          </div>
        </div>
      )}
      <button className="ai-fab" onClick={() => setOpen((o) => !o)}
        aria-label={open ? 'Close AI Assistant' : 'Open AI Assistant'}
        title="AI Assistant">◈</button>
    </>
  );
}
```

- [ ] **Step 2: Mount it in the shell; retire the page**

In `src/modules/tubular/TubularModule.tsx`:
- Delete line `import AssistantView from './views/AssistantView';`
- Add import: `import FloatingAssistant from './components/FloatingAssistant';`
- Replace `<Route path="assistant" element={<AssistantView />} />` with `<Route path="assistant" element={<Navigate to="/tubular" replace />} />` (`Navigate` was imported in Task 3).
- In the shell JSX, render the assistant inside `.tubular-app` after `</main>`:

```tsx
        <div className="tubular-app">
          <TubularTopbar />
          <TubularTabNav />
          <main>
            <AccessGate />
          </main>
          <FloatingAssistant />
        </div>
```

Then: `git rm src/modules/tubular/views/AssistantView.tsx`

- [ ] **Step 3: Style the floating panel and move toasts clear of it**

In `src/modules/tubular/tubular.css`:
- First read the existing `.tubular-app .panel` and `.tubular-app .chat-input-row` rules and reuse their background/border color tokens for the panel below if they differ from the fallbacks shown (the module uses CSS variables like `--line`, `--text-3`, `--copper-2` that adapt to light/dark).
- Change the existing `.tubular-app .toast-wrap` rule's `bottom:24px` to `bottom:84px` (line ~330) so toasts stack above the assistant bubble.
- Append:

```css
/* --- floating AI assistant ------------------------------------------------ */
.tubular-app .ai-fab{position:fixed;bottom:20px;right:20px;z-index:450;width:48px;height:48px;border-radius:50%;border:none;background:var(--copper-2,#d97706);color:#10141b;font-size:20px;cursor:pointer;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 16px rgba(0,0,0,.35)}
.tubular-app .ai-fab:hover{filter:brightness(1.08)}
.tubular-app .ai-float{position:fixed;bottom:78px;right:20px;z-index:450;width:min(380px,calc(100vw - 32px));height:min(520px,calc(100vh - 150px));display:flex;flex-direction:column;background:var(--panel,#0f141c);border:1px solid var(--line);border-radius:12px;box-shadow:0 12px 40px rgba(0,0,0,.45);overflow:hidden}
.tubular-app .ai-float-head{display:flex;align-items:center;justify-content:space-between;padding:10px 12px;border-bottom:1px solid var(--line)}
.tubular-app .ai-float-head .title{display:flex;align-items:center;gap:8px;font-weight:700;font-size:12.5px}
.tubular-app .ai-float-min{background:none;border:none;color:var(--text-3);cursor:pointer;font-size:14px;padding:2px 6px}
.tubular-app .ai-float-body{flex:1;overflow-y:auto;padding:12px;display:flex;flex-direction:column;gap:10px}
.tubular-app .ai-float-suggest{display:flex;flex-wrap:wrap;gap:6px;padding:8px 12px;border-top:1px solid var(--line)}
.tubular-app .ai-float-input{display:flex;gap:8px;padding:10px 12px;border-top:1px solid var(--line)}
.tubular-app .ai-float-input textarea{flex:1;resize:none}
```

(If `--panel` is not an existing variable in tubular.css, substitute the actual background token/value the `.panel` rule uses.)

- [ ] **Step 4: Verify, test, build**

Run: `grep -rn "AssistantView" src/` — expected: no output.
Run: `npm test && npm run build` — expected: PASS.
Run: `npm run dev` and check on `/tubular`, `/tubular/inventory`, and `/tubular/contracts`: the ◈ bubble floats bottom-right on every page without covering content; clicking expands the panel; a suggestion chip returns a data answer; minimize collapses it; navigating keeps the bubble; `/tubular/assistant` redirects to the dashboard; saving on Data Entry shows the toast above the bubble. Check light + dark themes and a narrow (~500px) viewport. Stop the dev server.

- [ ] **Step 5: Commit**

```bash
git add -A src/modules/tubular
git commit -m "feat(tubular): floating collapsible AI assistant on all pages, retire assistant page"
```

---

### Task 9: Consistency sweep and final verification

Every rename must hold across titles, nav, and internal references (spec item 9), and the whole suite must be green.

**Files:**
- Possibly modify: any file the greps below flag.

**Interfaces:**
- Consumes: everything above. Produces: the finished branch.

- [ ] **Step 1: Stale-name sweep**

Run each; expected **no output** (fix any hit by applying the Global Constraints naming, then re-run):

```bash
grep -rn "Fleet Inventory\|Master Register\|Live Activity" src/
grep -rn "MovementsView\|TrainingView\|ManualView\|AssistantView\|FleetInventoryView\|MasterRegisterView" src/
grep -rn "tubular/transfers\|tubular/training" src/
```

Also run `grep -rn "Data Entry tab\|Manual page" src/` and reword any hit to match the new UX (button / merged Reference).

- [ ] **Step 2: Full test suite, typecheck, lint, build**

Run: `npm test && npm run lint && npm run build`
Expected: all tests PASS (suite was 212 green before this work; count will drop slightly from the two removed tab tests), no lint errors, build succeeds.

- [ ] **Step 3: End-to-end visual pass**

Run `npm run dev` and walk every tab as an admin: **Dashboard** (pie in place of feed, 6 KPIs, 3 live cards, 4 other charts, attention table), **Tubular Inventory**, **Master Sheet**, **Contracts**, **Asset Map**, **Order Pipe**, **Reference** (tables + guide + FAQ + jump-to), **Import**. Confirm the tab strip shows exactly those 8 in that order numbered /01–/08 with no gaps, the ✎ Data Entry button sits under System Online, and the ◈ assistant floats everywhere. Repeat the tab-strip check as a `field` user holding only `view` (expect 6 tabs: no Master Sheet, no Import, no Data Entry button). Stop the dev server.

- [ ] **Step 4: Commit any sweep fixes**

```bash
git add -A src/
git commit -m "chore(tubular): naming consistency sweep after UX refresh"
```

(Skip the commit if Step 1 found nothing and nothing changed.)
