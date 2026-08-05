# Tubular Client Quick-Filter & Chart Labels — Design

Approved by user 2026-08-05 (chat). Scope: Tubular module frontend only — no database, routing, or permission changes.

## Goal

1. Filter the Tubular Dashboard, Tubular Inventory, and Master Sheet by **client** (the company each rig/hoist works for).
2. Show **value labels** on all five dashboard charts.
3. Remove **white** from chart colors (Premium becomes blue).

## 1. Client mapping — `src/modules/tubular/lib/clients.ts` (new)

A frontend constant; no migration. Keys are exact unit names as stored in `tubular_units.name`.

```ts
export const CLIENT_BY_UNIT: Record<string, string> = {
  'Rig 103': 'PDO',  'Rig 104': 'PDO',  'Rig 105': 'Medco', 'Rig 106': 'PDO',
  'Rig 107': 'PDO',  'Rig 108': 'PDO',  'Rig 109': 'PDO',   'Rig 110': 'OQ',
  'Rig 111': 'OQ',   'Rig 112': 'K.S.C',
  'Rig 201': 'PDO',  'Rig 202': 'PDO',  'Rig 203': 'PDO',   'Rig 204': 'ARA',
  'Rig 205': 'OQ',   'Rig 206': 'OXY',  'Rig 207': 'OXY',   'Rig 208': 'OXY',
  'Rig 209': 'OXY',  'Rig 210': 'OQ',   'Rig 211': 'K.S.C',
  'Rig 301': 'PDO',  'Rig 302': 'PDO',  'Rig 303': 'PDO',   'Rig 304': 'PDO',
  'Rig 305': 'BP',   'Rig 306': 'PDO',  'Rig 401': 'K.S.C',
  'Hoist 1': 'PDO',  'Hoist 2': 'PDO',  'Hoist 3': 'PDO',
  'Hoist 4': 'PDO',  'Hoist 5': 'PDO',
};
```

Rigs 112, 211, 301, and 401 are in the map even though they are not yet units in the database — the filter picks them up automatically when those units are created. (The user's list included 301; current DB rigs span 103–111, 201–210, 302–306 per the 2026-07 import — mismatches are harmless.)

Helpers (all pure, unit-tested):

- `clientOf(unitName: string): string | null` — map lookup, null when unmapped.
- `clientsIn(units: { name: string }[]): string[]` — sorted unique client names present among the given units.
- `unitIdsForClient(units: { id: string; name: string }[], client: string): Set<string>` — ids of the units belonging to `client`.

Unmapped units: never match any client selection; visible only under "All Clients".

## 2. Client quick-filter UI

A `<select>` labeled **Client** with options: `All Clients` + `clientsIn(units)`, added to the existing filter bars of:

- **TubularDashboardView** — before the existing unit Filter select. Selecting a client scopes `records` (KPIs, all charts, attention table) to that client's unit ids AND narrows the rig dropdown's options to that client's units. If the currently selected rig is not among them, the rig filter resets to `all`.
- **TubularInventoryView** — in the view bar. Scopes both the per-unit cards and the classification table rows.
- **MasterSheetView** — in its filter bar. Scopes table rows (composes with the existing unit select the same way as the dashboard: unit options narrow, selection resets to all-units if outside the client).

State is per-view local `useState` (no shared store, no URL params — matches how the existing unit filters work).

## 3. Chart value labels

New dependency: `chartjs-plugin-datalabels` (^2). Registered in `TubularDashboardView` alongside the existing Chart.js registrations; because the plugin is global once registered, every chart config sets an explicit `plugins.datalabels` block (no accidental defaults).

Per chart:

| Chart | Label | Placement |
|---|---|---|
| Tubular Type · Classification Breakdown (stacked h-bar) | segment value | inside segment; hidden when segment < 4% of that bar's total |
| Fleet Class Mix (doughnut) | `value (pct%)` | inside slice; hidden when slice < 4% of total |
| Joints per Rig (pie) | value | inside slice; hidden when slice < 4% of total |
| Inventory by Unit (v-bar) | value | above bar end (anchor end) |
| Contract Variance (h-bar) | signed value | outside bar end |

Typography: font size 9, weight 600. Colors: `#10141b` inside colored slices/segments; `#a4adc0` for outside-anchored bar labels (matches existing tick colors, which are hard-coded in this file by established pattern).

## 4. No white in charts

Replace `#f1f5f9` (near-white Premium) with **`#60a5fa`** (blue) in:

- the Premium dataset of the type-breakdown chart,
- the class-mix doughnut palette,
- the `PIE_COLORS` entry — here the replacement is indigo `#818cf8` (not `#60a5fa`), because `PIE_COLORS` already contains blue `#3b82f6` and the palette cycles across up to 29 units.

Unchanged: the KPI card's white Premium band swatch and the Reference page's classification/band tables — those depict the physical API RP 7G white band marking, not chart data.

## Error handling & edge cases

- Client selected, zero matching records → charts/tables render their existing empty states; no crash (aggregation of an empty list already yields zeros).
- Rig-filter reset on client change prevents contradictory selections (client=OXY + rig=Rig 103).
- Datalabels on empty charts: display callbacks guard division by zero (total 0 → hide label).

## Testing

- `clients.test.ts`: mapping spot-checks (103→PDO, 105→Medco, 305→BP, Hoist 5→PDO), `clientsIn` uniqueness/sort, `unitIdsForClient` filtering, unmapped-unit behavior.
- Existing suite stays green; `npm run build` (typecheck) green.
- Manual browser pass, light + dark: filter on all three pages, labels on all five charts, no white anywhere in the charts.
