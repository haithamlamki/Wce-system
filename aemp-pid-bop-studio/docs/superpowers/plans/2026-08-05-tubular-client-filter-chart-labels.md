# Tubular Client Quick-Filter & Chart Labels Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Client quick-filter (rig→client mapping) to the Tubular Dashboard, Tubular Inventory, and Master Sheet; put value labels on all five dashboard charts; replace white with blue in chart colors.

**Architecture:** A new pure mapping module `lib/clients.ts` (frontend constant, no DB change) feeds a per-view `<select>` that composes with each view's existing unit filters. Chart labels come from `chartjs-plugin-datalabels`, attached per-chart via the config-level `plugins: [ChartDataLabels]` array (NOT registered globally, so no other Chart.js usage is affected).

**Tech Stack:** React 18 + TypeScript, Chart.js 4 + chartjs-plugin-datalabels 2, Vitest.

**Spec:** `docs/superpowers/specs/2026-08-05-tubular-client-filter-chart-labels-design.md` (approved 2026-08-05).

## Global Constraints

- Work in the app root `aemp-pid-bop-studio/` — all paths below are relative to it; run all commands from it.
- Create branch `feat/tubular-client-filter` from `main`.
- Frontend only: no database, migration, routing, or permission changes.
- The client dropdown label is **"Client"**, first option **"All Clients"**; clients come from `clientsIn(units)` (only clients present among loaded units).
- Selecting a client must also narrow the view's unit dropdown to that client's units, and reset the unit selection if it falls outside the client.
- Premium chart color is exactly **`#60a5fa`** (replaces `#f1f5f9`); no white/near-white anywhere in chart datasets. The KPI card's white band swatch and the Reference page tables keep their white (physical band marking, not chart data).
- Datalabel typography: font size 9 (8.5 on the two bottom bar charts), weight 600; color `#10141b` inside slices/segments, `#a4adc0` for labels anchored outside bars. Segments/slices below 4% of their total hide their label.
- Baseline: the full suite currently passes 238/238. `npm test`, `npm run lint`, and `npm run build` must stay green at every commit.
- Commit style `feat(tubular): …`; never add a Co-Authored-By trailer.

---

### Task 1: Client mapping module (`lib/clients.ts`)

**Files:**
- Create: `src/modules/tubular/lib/clients.ts`
- Test: `src/modules/tubular/lib/clients.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces (used by Tasks 2–4): `CLIENT_BY_UNIT: Record<string, string>`; `clientOf(unitName: string): string | null`; `clientsIn(units: ReadonlyArray<{ name: string }>): string[]`; `unitIdsForClient(units: ReadonlyArray<{ id: string; name: string }>, client: string): Set<string>`.

- [ ] **Step 1: Write the failing tests**

Create `src/modules/tubular/lib/clients.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { CLIENT_BY_UNIT, clientOf, clientsIn, unitIdsForClient } from './clients';

describe('client mapping', () => {
  it('maps known units to their client', () => {
    expect(clientOf('Rig 103')).toBe('PDO');
    expect(clientOf('Rig 105')).toBe('Medco');
    expect(clientOf('Rig 110')).toBe('OQ');
    expect(clientOf('Rig 112')).toBe('K.S.C');
    expect(clientOf('Rig 204')).toBe('ARA');
    expect(clientOf('Rig 206')).toBe('OXY');
    expect(clientOf('Rig 305')).toBe('BP');
    expect(clientOf('Rig 401')).toBe('K.S.C');
    expect(clientOf('Hoist 5')).toBe('PDO');
  });

  it('returns null for unmapped units', () => {
    expect(clientOf('Rig 999')).toBeNull();
    expect(clientOf('')).toBeNull();
  });

  it('covers exactly the 33 agreed units and 7 clients', () => {
    expect(Object.keys(CLIENT_BY_UNIT)).toHaveLength(33);
    expect(new Set(Object.values(CLIENT_BY_UNIT)).size).toBe(7);
  });

  it('clientsIn returns sorted unique clients present among the given units', () => {
    const units = [{ name: 'Rig 110' }, { name: 'Rig 103' }, { name: 'Rig 104' }, { name: 'Rig 999' }];
    expect(clientsIn(units)).toEqual(['OQ', 'PDO']);
    expect(clientsIn([])).toEqual([]);
  });

  it("unitIdsForClient picks only that client's units", () => {
    const units = [
      { id: 'a', name: 'Rig 103' }, { id: 'b', name: 'Rig 110' },
      { id: 'c', name: 'Hoist 1' }, { id: 'd', name: 'Rig 999' },
    ];
    expect(unitIdsForClient(units, 'PDO')).toEqual(new Set(['a', 'c']));
    expect(unitIdsForClient(units, 'OQ')).toEqual(new Set(['b']));
    expect(unitIdsForClient(units, 'BP')).toEqual(new Set());
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/modules/tubular/lib/clients.test.ts`
Expected: FAIL — cannot resolve `./clients`.

- [ ] **Step 3: Implement the module**

Create `src/modules/tubular/lib/clients.ts`:

```ts
// ============================================================================
//  Client mapping — which client each Rig/Hoist works for. Frontend constant
//  (no DB column): keys are exact tubular_units.name values. Units missing
//  from this map match no client selection and appear only under
//  "All Clients". Rigs listed here that are not yet units in the database
//  (112, 211, 401) start working the day their unit rows are created.
// ============================================================================

export const CLIENT_BY_UNIT: Record<string, string> = {
  'Rig 103': 'PDO', 'Rig 104': 'PDO', 'Rig 105': 'Medco', 'Rig 106': 'PDO',
  'Rig 107': 'PDO', 'Rig 108': 'PDO', 'Rig 109': 'PDO', 'Rig 110': 'OQ',
  'Rig 111': 'OQ', 'Rig 112': 'K.S.C',
  'Rig 201': 'PDO', 'Rig 202': 'PDO', 'Rig 203': 'PDO', 'Rig 204': 'ARA',
  'Rig 205': 'OQ', 'Rig 206': 'OXY', 'Rig 207': 'OXY', 'Rig 208': 'OXY',
  'Rig 209': 'OXY', 'Rig 210': 'OQ', 'Rig 211': 'K.S.C',
  'Rig 301': 'PDO', 'Rig 302': 'PDO', 'Rig 303': 'PDO', 'Rig 304': 'PDO',
  'Rig 305': 'BP', 'Rig 306': 'PDO', 'Rig 401': 'K.S.C',
  'Hoist 1': 'PDO', 'Hoist 2': 'PDO', 'Hoist 3': 'PDO',
  'Hoist 4': 'PDO', 'Hoist 5': 'PDO',
};

/** Client for a unit name, or null when the unit is not in the map. */
export function clientOf(unitName: string): string | null {
  return CLIENT_BY_UNIT[unitName] ?? null;
}

/** Sorted unique client names present among the given units. */
export function clientsIn(units: ReadonlyArray<{ name: string }>): string[] {
  return [...new Set(
    units.map((u) => clientOf(u.name)).filter((c): c is string => c !== null),
  )].sort();
}

/** Ids of the given units that belong to `client`. */
export function unitIdsForClient(
  units: ReadonlyArray<{ id: string; name: string }>,
  client: string,
): Set<string> {
  return new Set(units.filter((u) => clientOf(u.name) === client).map((u) => u.id));
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/modules/tubular/lib/clients.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/modules/tubular/lib/clients.ts src/modules/tubular/lib/clients.test.ts
git commit -m "feat(tubular): client mapping module (rig/hoist -> client)"
```

---

### Task 2: Dashboard client filter

**Files:**
- Modify: `src/modules/tubular/views/TubularDashboardView.tsx`

**Interfaces:**
- Consumes: `clientOf`, `clientsIn` from `../lib/clients` (Task 1).
- Produces: nothing used by later tasks.

- [ ] **Step 1: Add import and state**

In `TubularDashboardView.tsx`, add to the imports (next to the other `../lib/` imports):

```ts
import { clientOf, clientsIn } from '../lib/clients';
```

Next to the existing `const [rigFilter, setRigFilter] = useState('all');` add:

```ts
const [clientFilter, setClientFilter] = useState('all');
```

- [ ] **Step 2: Derive client-scoped units and records**

Immediately after the existing `unitById` memo, add:

```ts
const clientUnits = useMemo(
  () => (clientFilter === 'all' ? units : units.filter((u) => clientOf(u.name) === clientFilter)),
  [units, clientFilter],
);
const clientUnitIds = useMemo(() => new Set(clientUnits.map((u) => u.id)), [clientUnits]);
```

Replace the existing `scoped` memo:

```ts
const scoped = useMemo(
  () => (rigFilter === 'all' ? records : records.filter((r) => r.unitId === rigFilter)),
  [records, rigFilter],
);
```

with:

```ts
const scoped = useMemo(
  () => records.filter((r) =>
    (clientFilter === 'all' || clientUnitIds.has(r.unitId))
    && (rigFilter === 'all' || r.unitId === rigFilter)),
  [records, clientFilter, clientUnitIds, rigFilter],
);
```

- [ ] **Step 3: Client select + narrowed rig options in the unit-bar**

Add a change handler next to the other handlers (before the `return`):

```ts
const onClientChange = (v: string) => {
  setClientFilter(v);
  if (v !== 'all' && rigFilter !== 'all'
    && !units.some((u) => u.id === rigFilter && clientOf(u.name) === v)) {
    setRigFilter('all');
  }
};
```

In the `unit-bar` JSX, insert BEFORE the existing `<span className="lbl">Filter</span>`:

```tsx
<span className="lbl">Client</span>
<select id="dash-client-filter" value={clientFilter} onChange={(e) => onClientChange(e.target.value)}>
  <option value="all">All Clients</option>
  {clientsIn(units).map((c) => <option key={c} value={c}>{c}</option>)}
</select>
```

and change the rig select's options from `{units.map((u) => …)}` to `{clientUnits.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}`.

- [ ] **Step 4: Scope the Total Units KPI to the client**

In the KPI grid, change the "Total Units" card:

- `<div className="val" id="k-units">{units.length}</div>` → `{clientUnits.length}`
- `<div className="delta" id="k-units-sub">{unitsWithData} active · {units.length - unitsWithData} empty</div>` → `{unitsWithData} active · {clientUnits.length - unitsWithData} empty`

(`unitsWithData` already derives from `scoped`, so it narrows automatically.)

- [ ] **Step 5: Verify**

Run: `npm test && npm run build`
Expected: all tests pass (243 total: 238 baseline + 5 from Task 1); build succeeds.

- [ ] **Step 6: Commit**

```bash
git add src/modules/tubular/views/TubularDashboardView.tsx
git commit -m "feat(tubular): dashboard client quick-filter"
```

---

### Task 3: Tubular Inventory client filter

**Files:**
- Modify: `src/modules/tubular/views/TubularInventoryView.tsx`

**Interfaces:**
- Consumes: `clientOf`, `clientsIn` from `../lib/clients` (Task 1).
- Produces: nothing used by later tasks.

- [ ] **Step 1: Import, state, derived units**

Add import:

```ts
import { clientOf, clientsIn } from '../lib/clients';
```

Next to `const [mode, setMode] = useState<'fleet' | 'single'>('fleet');` add:

```ts
const [clientFilter, setClientFilter] = useState('all');
```

After the existing `unitById` memo add:

```ts
const clientUnits = useMemo(
  () => (clientFilter === 'all' ? units : units.filter((u) => clientOf(u.name) === clientFilter)),
  [units, clientFilter],
);
const clientUnitIds = useMemo(() => new Set(clientUnits.map((u) => u.id)), [clientUnits]);
```

- [ ] **Step 2: Keep the single-unit selection inside the client**

Replace the existing effect

```ts
useEffect(() => { if (!unitId && units.length) setUnitId(units[0].id); }, [units, unitId]);
```

with:

```ts
useEffect(() => {
  if (clientUnits.length && (!unitId || !clientUnits.some((u) => u.id === unitId))) {
    setUnitId(clientUnits[0].id);
  }
}, [clientUnits, unitId]);
```

- [ ] **Step 3: Filter rows and unit cards**

In the `filtered` memo, after `if (!item) return false;` add:

```ts
if (clientFilter !== 'all' && !clientUnitIds.has(r.unitId)) return false;
```

and extend the dependency array to `[records, catById, mode, unitId, tubFilter, clientFilter, clientUnitIds]`.

For the cards, change

```tsx
{(mode === 'fleet' ? unitCards : unitCards.filter((x) => x.unit.id === unitId)).map(({ unit, t }) => (
```

to

```tsx
{(mode === 'fleet'
  ? unitCards.filter((x) => clientFilter === 'all' || clientUnitIds.has(x.unit.id))
  : unitCards.filter((x) => x.unit.id === unitId)).map(({ unit, t }) => (
```

- [ ] **Step 4: Client select in the unit-bar; narrow the unit select**

Insert at the START of the `unit-bar` div (before `<span className="lbl">View</span>`):

```tsx
<span className="lbl">Client</span>
<select id="fleet-client" value={clientFilter} onChange={(e) => setClientFilter(e.target.value)}>
  <option value="all">All Clients</option>
  {clientsIn(units).map((c) => <option key={c} value={c}>{c}</option>)}
</select>
```

In the single-unit select, change the options source from `{units.map((u) => …)}` to `{clientUnits.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}`.

- [ ] **Step 5: Verify**

Run: `npm test && npm run build`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add src/modules/tubular/views/TubularInventoryView.tsx
git commit -m "feat(tubular): inventory client quick-filter"
```

---

### Task 4: Master Sheet client filter

**Files:**
- Modify: `src/modules/tubular/views/MasterSheetView.tsx`

**Interfaces:**
- Consumes: `clientOf`, `clientsIn` from `../lib/clients` (Task 1).
- Produces: nothing used by later tasks.

- [ ] **Step 1: Import, state, derived units**

Add import:

```ts
import { clientOf, clientsIn } from '../lib/clients';
```

Next to `const [unitFilter, setUnitFilter] = useState('all');` add:

```ts
const [clientFilter, setClientFilter] = useState('all');
```

After the existing `unitById` memo add:

```ts
const clientUnits = useMemo(
  () => (clientFilter === 'all' ? units : units.filter((u) => clientOf(u.name) === clientFilter)),
  [units, clientFilter],
);
```

- [ ] **Step 2: Filter rows**

In the `rows` memo's filter, after `if (!item || !unit) return false;` add:

```ts
if (clientFilter !== 'all' && clientOf(unit.name) !== clientFilter) return false;
```

and add `clientFilter` to the memo's dependency array.

- [ ] **Step 3: Client select + narrowed unit options + reset**

Add a handler before the `return`:

```ts
const onClientChange = (v: string) => {
  setClientFilter(v);
  if (v !== 'all' && unitFilter !== 'all'
    && clientOf(unitById.get(unitFilter)?.name ?? '') !== v) {
    setUnitFilter('all');
  }
};
```

In the `unit-bar` JSX, insert BEFORE `<span className="lbl">Unit</span>`:

```tsx
<span className="lbl">Client</span>
<select id="master-client" value={clientFilter} onChange={(e) => onClientChange(e.target.value)}>
  <option value="all">All Clients</option>
  {clientsIn(units).map((c) => <option key={c} value={c}>{c}</option>)}
</select>
```

and change the unit select's options from `{units.map((u) => …)}` to `{clientUnits.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}`.

- [ ] **Step 4: Verify**

Run: `npm test && npm run build`
Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add src/modules/tubular/views/MasterSheetView.tsx
git commit -m "feat(tubular): master sheet client quick-filter"
```

---

### Task 5: Chart value labels + no white in charts

**Files:**
- Modify: `package.json` / `package-lock.json` (new dependency)
- Modify: `src/modules/tubular/views/TubularDashboardView.tsx`

**Interfaces:**
- Consumes: the five chart configs in `TubularDashboardView.tsx` (canvas refs `chTypeRef`, `chMixRef`, `chUnitRef`, `chPieRef`, `chVarRef`).
- Produces: nothing used by later tasks.

- [ ] **Step 1: Install the plugin**

Run: `npm install chartjs-plugin-datalabels@^2`
Expected: dependency added; `npm run build` still succeeds.

- [ ] **Step 2: Import the plugin and shared label options (per-chart, NOT global)**

In `TubularDashboardView.tsx` add:

```ts
import ChartDataLabels from 'chartjs-plugin-datalabels';
import type { Context as DatalabelsContext } from 'chartjs-plugin-datalabels';
```

(If TypeScript cannot resolve the `Context` type from the package root, import it from `'chartjs-plugin-datalabels/types/context'` instead.)

Do NOT add `ChartDataLabels` to the `Chart.register(...)` call — global registration would silently turn labels on for any other chart in the app. Instead, each of the five `new Chart(...)` calls in this file gets a config-level plugin array:

```ts
new Chart(el, { type: ..., data: ..., options: ..., plugins: [ChartDataLabels] })
```

Add two module-scope helpers next to `TOOLTIP_STYLE`:

```ts
/** Hide labels for slices/segments under 4% of their chart's total. */
const sliceVisible = (ctx: DatalabelsContext): boolean => {
  const data = ctx.dataset.data as number[];
  const total = data.reduce((a, b) => a + (b || 0), 0);
  return total > 0 && ((data[ctx.dataIndex] || 0) / total) >= 0.04;
};
const fmtNum = (v: number) => v.toLocaleString();
```

- [ ] **Step 3: Labels on the Tubular Type breakdown (stacked h-bar, `chTypeRef`)**

Add `plugins: [ChartDataLabels]` to its `new Chart` config, and inside its `options.plugins` add:

```ts
datalabels: {
  color: '#10141b', font: { size: 9, weight: 600 },
  formatter: fmtNum,
  display: (ctx: DatalabelsContext) => {
    const v = (ctx.dataset.data[ctx.dataIndex] as number) || 0;
    const total = ctx.chart.data.datasets.reduce(
      (s, ds) => s + ((ds.data[ctx.dataIndex] as number) || 0), 0);
    return total > 0 && v / total >= 0.04 ? 'auto' : false;
  },
},
```

(Here the 4% is of the BAR's stacked total across datasets, so thin segments stay clean; `'auto'` lets the plugin also hide labels that don't fit.)

- [ ] **Step 4: Labels on Fleet Class Mix (doughnut, `chMixRef`) and Joints per Rig (pie, `chPieRef`)**

Both get `plugins: [ChartDataLabels]` and, in `options.plugins`:

Class mix (value + percent):

```ts
datalabels: {
  color: '#10141b', font: { size: 9.5, weight: 600 },
  display: sliceVisible,
  formatter: (v: number, ctx: DatalabelsContext) => {
    const data = ctx.dataset.data as number[];
    const total = data.reduce((a, b) => a + (b || 0), 0);
    return `${fmtNum(v)} (${total ? ((v / total) * 100).toFixed(1) : 0}%)`;
  },
},
```

Joints per Rig (value only):

```ts
datalabels: {
  color: '#10141b', font: { size: 9, weight: 600 },
  display: sliceVisible,
  formatter: fmtNum,
},
```

- [ ] **Step 5: Labels on Inventory by Unit (v-bar, `chUnitRef`) and Contract Variance (h-bar, `chVarRef`)**

Both get `plugins: [ChartDataLabels]` and, in `options.plugins`:

Inventory by Unit (above the bar):

```ts
datalabels: {
  anchor: 'end', align: 'end', clamp: true,
  color: '#a4adc0', font: { size: 8.5, weight: 600 },
  display: 'auto',
  formatter: fmtNum,
},
```

Contract Variance (outside the bar end, signed):

```ts
datalabels: {
  anchor: 'end', align: 'end', clamp: true,
  color: '#a4adc0', font: { size: 8.5, weight: 600 },
  display: 'auto',
  formatter: (v: number) => `${v > 0 ? '+' : ''}${fmtNum(v)}`,
},
```

- [ ] **Step 6: Replace white with blue `#60a5fa`**

Still in `TubularDashboardView.tsx`, three replacements of `#f1f5f9`:

1. Type breakdown Premium dataset: `{ label: 'Premium', data: …, backgroundColor: '#f1f5f9' }` → `'#60a5fa'`
2. Class mix palette: `backgroundColor: ['#f1f5f9', '#facc15', '#fb923c', '#ef4444', '#a855f7']` → `['#60a5fa', '#facc15', '#fb923c', '#ef4444', '#a855f7']`
3. `PIE_COLORS`: replace the `'#f1f5f9'` entry with `'#60a5fa'` — but `PIE_COLORS` already contains `'#3b82f6'` (blue); to keep adjacent pie slices distinguishable, replace `'#f1f5f9'` with `'#818cf8'` (indigo) in `PIE_COLORS` ONLY. Premium's semantic color (charts 1 and 2 above) stays `#60a5fa`.

Verify with: `grep -n "f1f5f9" src/modules/tubular/views/TubularDashboardView.tsx` → no output. (The KPI band `background: '#fff'` in the same file is the card swatch, NOT a chart — leave it.)

- [ ] **Step 7: Verify + visual pass**

Run: `npm test && npm run lint && npm run build`
Expected: all green.

Run `npm run dev` and check `http://localhost:5173/tubular` in light AND dark themes (headless implementers: skip the browser part; the controller does it):
- Client dropdown on Dashboard, Tubular Inventory, Master Sheet; picking "OXY" shows only Rigs 206–209 everywhere, unit dropdowns narrow, KPIs/charts/tables rescope; switching back to All Clients restores everything.
- All five charts show value labels; tiny slices/segments show none; nothing overlaps illegibly.
- No white in any chart; Premium reads as blue in the type breakdown and class mix.

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json src/modules/tubular/views/TubularDashboardView.tsx
git commit -m "feat(tubular): chart value labels via datalabels plugin + replace white with blue"
```
