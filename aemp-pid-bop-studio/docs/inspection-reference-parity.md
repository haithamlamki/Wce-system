# Equipment Inspection — Reference Parity Spec & Tracker

Reference: <https://einspection.abrajenergy.com/> — captured live 2026-08-14.

> **Important:** the reference system was rewritten since the 2026-08-12 plan capture.
> It is no longer the top-tab / flat-register system the plan describes. It is now a
> sidebar-shell application. This document supersedes the plan's "Source system" section
> as the parity target.

## 1. Shell

**Topbar** (height ~56px, white, bottom border `--border`):
- left: sidebar collapse icon button, ABRAJ logo mark, wordmark text `Equipment Master Pro`
- right: notification bell (icon button), dark-mode toggle (moon icon), avatar circle with
  initials (`HA`) + full user name.

**Sidebar** (256px wide, white, right border). Section headings are uppercase, ~10px,
letter-spaced, muted. Items are buttons with icon + label, 8px radius, `8px 12px` padding,
~38.6px tall; active item has a tinted primary background and primary text.

| Section | Items (exact order) |
|---|---|
| MAIN | Dashboard |
| EQUIPMENT | Equipment, Inspections, Approvals, Shared Documents, Equipment Categories, P&ID, Library |
| ADMINISTRATION | Inspection Frequencies |
| ORGANIZATION | Companies, Units |

## 2. Design tokens (from reference `:root`)

```
--p-brand   oklch(55% .15 248)     /* primary blue */
--p-accent  oklch(70% .11 195)
--p-success oklch(60% .15 155)
--p-warning oklch(71% .16 75)
--p-danger  oklch(57.5% .22 25)
--p-info    oklch(63.5% .13 225)
--background/--surface/--card  #fff
--surface-2 #f4f4f5   --surface-3 #e4e4e7
--border    #e5e7eb   --border-2  #d1d5db   --border-3 #9ca3af
--foreground #18181b  --foreground-2 #27272a  --subtle-foreground #71717a
```

Font: `"Inter Variable", Inter, ui-sans-serif, system-ui, sans-serif`.
Base 16px. Table header 12.8px / weight 500 / colour `#52525b` / subtle grey background /
1.2px bottom border. Table body cell 13.9px / weight 400 / `#18181b`. Radius 8px.

## 3. Standard list-page pattern

Every list page shares one layout:

1. `h1` page title + one-line muted subtitle.
2. Optional right-aligned primary actions.
3. Optional chip row / filter selects.
4. Toolbar: left search input (page-specific placeholder), right `Filters` and `Columns` buttons.
5. Table with sortable headers.
6. Footer: page-size `<select>` (default 10) + numbered pagination buttons.

## 4. Pages

| Route (reference) | Title | Columns / content |
|---|---|---|
| `/` | Dashboard | analytics — see §5 |
| `/equipment` | Equipment | Equipment Type, Category, Description, Parts, Specs, actions. Search `Search equipment…` |
| `/inspection` | Equipment Inspection | see §6 |
| `/inspection/new` | New record form | see §7 |
| `/inspection/approvals` | Approvals | ☐, Serial, Equipment, Part, Rig, Requested by, When, Status, actions. Button `Run due-date notifications now`. Search `Search serial, equipment, rig…` |
| `/inspection/shared-documents` | Shared Documents | Name, Rig, Files, Linked records, Description, Created by, actions. Search `Search document sets...` |
| `/equipment-categories` | Equipment Categories | Category, Equipment, actions (7 rows). Search `Search equipment categories…` |
| `/pid` | P&ID | Unit, Company, Inspector, Status, Components, actions. Search `Search projects…` |
| `/library` | Library | two panes: `Library` folder tree + `Files` list |
| `/admin/inspection-frequencies` | Inspection Frequencies | Label, Unit, Amount, Major, Intermediate, Order, Status, actions (9 rows). Search `Search frequencies…` |
| `/companies` | Companies | Name, Description, Units, actions. Search `Search companies…` |
| `/units` | Units | Name, Company, Description, actions. Search `Search units…` |

## 5. Dashboard

Header: `Dashboard` + `Welcome back, <user>.`

KPI row (5 cards, each label / big value / sub-caption):
Compliance Score `38%` "5847/6482 scheduled" · Overdue `6165` "worst 739660d" ·
Due next 30 `362` · Coverage `90%` "9900 obligations" · Avg approval `8.8` "days".

Sections and cards:
- **Compliance & Risk** — Compliance Score (radial gauge + "Critical" label), Overdue Aging
  (bar: 1-30 / 31-60 / 60+), Compliance by Rig (horizontal bars, % labels),
  Distribution (stacked bars with `Category | Rig | Status` toggle; legend compliant/dueSoon/overdue)
- **Planning & Behaviour** — Due Forecast (Next 30 / 31-60 / 61-90), Inspection Kind
  (Intermediate / Major; total + overdue), Frequency Mix (1 Year, 5 Year, 6 Months, 2 Year,
  10 Year, 3 Year, 4 Year; onTrack + overdue)
- **Fleet & Assets** — Equipment Age · avg N yrs (0-5, 6-10, 11-15, 16-20, 20+, Unknown),
  OEM Concentration · N distinct OEMs (horizontal bars), Activity Trend (12 months, intermediate + major)
- **Process & Governance** — Approval Health (Pending / Avg approval / Approved 30d + bar
  Approved vs Pending Approval), Data Quality · N% complete (Due date, Serial, Frequency,
  Manuf. year, OEM)

## 6. Inspections page (`/inspection`)

- Title `Equipment Inspection`, subtitle `Browse and search inspection records by rig, equipment and category.`
- Right actions: `Export`, `Upload`, `+ New record` (primary).
- Category chips: `All`, Circulation System, Drilling Equipment, Hoisting System, Others,
  Power System, Rotary System, Well Control Equipment.
- Filter selects with labels `Rig` / `Equipment` / `Part`, defaults `All rigs` / `All equipment` / `All parts`.
- Search placeholder `Search serial, equipment, part…`; `Filters` + `Columns` buttons.
- Two-row header. Band row: (blank) · **Equipment** · **Inspection Schedule** · **Approval Workflow** · **Additional** · (blank).
  Column row: ☐ · Unit · Company · Serial · Equipment · Part · Component · Status ·
  Intermediate Due · Major Due · Approve Status · Remarks · actions.
- Cells: Status green `In Use` pill; overdue due-dates render as a red pill prefixed with a
  chevron, future dates as plain text, missing as `—`; Approve Status pill green `Approved`
  / blue `Pending Approval`. Row actions: documents icon + edit pencil.

## 7. New record form (`/inspection/new`)

Field order, exactly: Serial Number*, Part Number, OEM, Inspection Company*, Unit*, Company*,
Equipment*, Equipment Part*, Component, Component Description, Manufacture Year, Status,
Major Date, Major Frequency, Major Due (auto), Intermediate Date, Intermediate Frequency,
Intermediate Due (auto), Folder, Send to approver*.

Controls: comboboxes read `Select unit…`, `Select equipment…`, `Select equipment part…`,
`Select component…`, `Select status…`; date fields read `Pick a date`; frequency selects read
`Frequency…`; document upload block labelled by kind (e.g. `OEM Certificate`) with
`Click to choose documents`; approver combobox `Select an approver…`.
Buttons: `Back` (top), `Cancel`, `Save record`. Due (auto) fields are read-only.

## 8. Parity tracker

Legend — V = visual parity, F = functional parity. ✅ done · ⚠️ partial · ❌ missing · n/a.

V/F are the state **after** correction.

| # | Reference screen | Current equivalent | V | F | Differences found | Correction made | Verified | Remaining gap |
|---|---|---|---|---|---|---|---|---|
| 1 | Shell (topbar + sidebar) | `InspectionTopbar` + new `InspectionSidebar` | ✅ | ✅ | top tabs vs 256px sidebar with 4 sections; no dark toggle, avatar chip or collapse control | `InspectionTabNav` replaced by sectioned sidebar; topbar rebuilt with collapse, bell, dark toggle, avatar menu | typecheck + build | icon glyphs are unicode, not the reference's lucide set |
| 2 | Dashboard (analytics) | new `DashboardView` | ⚠️ | ⚠️ | our landing page was a flat register; reference is a 5-KPI + 13-card analytics page | built all four sections and every card from real record data | typecheck + build | "Avg approval"/"Approved 30d" render `—` (no `approved_at` column); bars are CSS, reference uses canvas charts |
| 3 | Equipment | new `EquipmentView` | ✅ | ✅ | reference columns Equipment Type/Category/Description/Parts/Specs vs our catalog CRUD table | rebuilt on the shared `DataTable` with the reference columns and search text | typecheck + build | — |
| 4 | Equipment detail | `CatalogView` (route `equipment/:typeId`) | ❓ | ✅ | reference detail page not inspected (session expired before capture) | re-routed as the type detail page; CRUD and `insp_manage_catalog` gate untouched | typecheck + build | layout not verified against the reference |
| 5 | Inspections | `RecordsView` (absorbed `DataDisplayTab`) | ✅ | ✅ | sub-tabs vs chips; no Rig/Equipment/Part filter row; band labels and due-date pills differed | chips + filter row + 4 header bands + badge cells; bulk dates and export preserved | typecheck + build + `DataTable.test.tsx` | reference's per-column Filters popover contents not captured |
| 6 | New record | `DataEntryForm` | ✅ | ✅ | different field order/labels; was an inline sub-tab, reference is its own page | full-page form, reference field order/labels/placeholders, read-only auto due dates, per-field validation | typecheck + build | reference's combobox widget replaced by native `<select>` |
| 7 | Approvals | `ApprovalsView` | ✅ | ✅ | different columns; no "Run due-date notifications now" action | reference columns + notifications action; approver scoping and `insp_approve` gate preserved | typecheck + build | `Requested by` shows `—` unless the creator is in the approver directory |
| 8 | Shared Documents | new `SharedDocumentsView` | ✅ | ❌ | page absent | page chrome + reference columns over an empty result | typecheck + build | no `insp_document_sets` table; needs a migration to hold real data |
| 9 | Equipment Categories | new `EquipmentCategoriesView` | ✅ | ✅ | page absent | 7 rows from `CATEGORY_ORDER` with type counts | typecheck + build | read-only (category is a DB enum) |
| 10 | P&ID | new `PidView` | ✅ | ❌ | page absent | page chrome + reference columns over an empty result | typecheck + build | P&ID projects live in the host WCE module; no cross-module read API |
| 11 | Library | `LibraryView` | ⚠️ | ✅ | reference has `Library` + `Files` panes | import repaired; existing explorer kept | typecheck + build | reference pane internals never captured; two-pane restyle not done |
| 12 | Inspection Frequencies | new `FrequenciesView` | ✅ | ✅ | page absent | 8 rows derived from the frequency constants, reference columns | typecheck + build | read-only (CHECK constraint owns the set) |
| 13 | Companies | new `CompaniesView` | ✅ | ⚠️ | page absent | reference columns over `insp_companies` | typecheck + build | no description column; unit count not company-scoped |
| 14 | Units | new `UnitsView` | ✅ | ⚠️ | page absent | reference columns over `public.units` | typecheck + build | `units` has no company FK, so Company is empty |
| 15 | Upload records | `DataUploadView` | ✅ | ✅ | was an inline sub-tab | own page with Back action, restyled; parsing/import logic untouched | typecheck + build | — |
| 16 | Login | host app sign-in | ❌ | ✅ | reference login is a branded centered card | **not changed** — out of module scope and shared with the host app | — | intentional deviation |

## 8b. Second pass — authenticated sweep (2026-08-14, later session)

The user signed in to both systems, which unblocked everything previously listed as
unverified. Newly captured from the live reference and now implemented:

**Lucide icon names** (read from the reference's own `svg.lucide-*` classes):
Dashboard `layout-dashboard`, Equipment `boxes`, Inspections `clipboard-check`,
Approvals `badge-check`, Shared Documents `file-stack`, Equipment Categories `tags`,
P&ID `share-2`, Library `folder-open`, Inspection Frequencies `timer`,
Companies `building-2`, Units `factory`; toolbar Filters `funnel`, Columns `settings-2`,
Export `file-down`, Upload `upload`, New record `plus`; topbar `panel-left`, `bell`, `moon`.
`lucide-react` is now a dependency and the module uses these exact glyphs.

**Filters** is not a popover — it toggles a per-column search row inside the table head,
with placeholders `Unit…`, `Company…`, `Serial…`, `Equipment…`, `Part…`, `Component…`,
`Status…`, `Filter Intermediate Due`, `Filter Major Due`, `Approve Status…` (Remarks has
no input). Reproduced in `DataTable`.

**Columns** is a grouped menu titled `Columns` with a `Reset columns` action and
`role="menuitemcheckbox"` items under the bands Equipment / Inspection Schedule /
Approval Workflow / Specifications. Default-checked: Company, Serial, Equipment, Part,
Component, Status, Major Due (Unit, Intermediate Due, Approve Status and Remarks are
pinned). Reproduced, including the Specifications band built from the union of the
catalog's `spec_fields`.

**Pickers** are `role="combobox"` triggers opening a dialog with a `Search…` box and
`role="option"` rows — not native selects. Reproduced as `components/Combobox.tsx` and
used for Rig / Equipment / Part and every picker on the record form.

**Dashboard layout** is two equal columns in every section (cards 1351px at x=307/1677,
19px gap, 16px radius, 1.2px border) — not an auto-fit track list. Section headings are
`h2`, 13.9px, weight 600, `#52525b`, letter-spacing -0.03em. Corrected.

**Charts** are real chart components (`data-chart` attributes). The CSS bars were replaced
with Chart.js canvases (bar / stacked bar / horizontal bar / line / doughnut with centre text).

**Dark palette** copied verbatim from the reference's `.dark` block:
`--background #07090f`, `--surface/--card #0f131c`, `--surface-2 #161c28`,
`--surface-3 #1f2838`, `--border #e2e8f012`, `--border-2 #e2e8f01f`,
`--border-3 #e2e8f033`, `--foreground #eef2fa`, `--foreground-2 #b8c1d4`,
`--subtle-foreground #6a748a`, `--popover #18202e`, primary lightened
`color-mix(in oklch, oklch(55% .15 248) 72%, #fff)`.

**Equipment detail** (`/equipment/:id`): summary block (Equipment Type, Category,
Description, SAP Equipment #, SAP Asset #), then `Specifications` listing the spec field
names, then `Parts & Components` with `No components.` when a part is empty. Reproduced,
minus the two SAP fields (no such columns in our schema).

**Library**: subtitle `Browse, upload and manage shared documents.`, two panes titled
`Library` and `Files`, file rows showing name, size (`3.8 MB`) and date in `Aug 13, 2026`
format — note this differs from the table date format `17 Jul 2025`. Reproduced.

**Bugs found and fixed by looking at the running app**
- `.insp-app` shrink-wrapped to 644px because the host renders modules inside a flex
  `<main class="viewport">`; added `flex: 1 1 auto; width: 100%; min-width: 0`.
- The Chart effect keyed on inline array props, rebuilding on every render and thrashing
  Chart.js's resize observer until the renderer froze; it now keys on a serialized data key.
- The dashboard pulled every column of 6,426 rows (~25s). It now selects only the columns
  it aggregates (`DASHBOARD_COLUMNS`).

## 8c. Third pass — parity closure (2026-08-14)

Schema facts below come from read-only queries against project `Wce-system`
(`reutvufibeezhknxdudc`, 6,426 records / 162 equipment types). **No migration was created
and no security or business logic was changed in this pass.**

### Verified schema (actual columns)

| Table | Columns |
|---|---|
| `insp_records` | id, type_id, part_id, component_id, unit_id, company_id, component_description, oem, inspection_company, serial_number, part_number, working_status, manufacture_year, intermediate_date, intermediate_freq_months, intermediate_due_date, major_date, major_freq_months, major_due_date, remarks, specs, approve_status, **approver_id**, reject_reason, created_by, created_at, updated_at |
| `insp_companies` | id, name, active, created_at |
| `units` | id, name, created_by, created_at, unit_type, latitude, longitude, active |
| `insp_equipment_types` | id, category, name, description, spec_fields, active, created_at |
| `projects` (host WCE) | id, rig_name, reference_date, inspector, revision, data, created_at, updated_at, created_by, version, updated_by, unit_id, name — RLS on, 4 policies, 4 rows |

> **Status update — B1, B2 and B3 are fixed** by migration
> `0034_inspection_approval_audit.sql`. `insp_records` gains `approved_at` and
> `approved_by`; `insp_set_approval` now records both and **no longer overwrites**
> `approver_id`, so the routing target survives approval. Existing approved rows had
> `approved_by` backfilled from `approver_id` (which is what the old RPC wrote there);
> `approved_at` is deliberately **not** backfilled, because no approval timestamp was ever
> stored and `updated_at` would fabricate one. The dashboard's "Avg approval" and
> "Approved 30d" tiles and the Columns menu's "Approved By" / "Approved Date" therefore
> report on approvals recorded from 0034 onward, and show an em dash until then.
> The remaining gaps below (B4–B10) are unchanged.

### Defect found during investigation (not a missing column)

`insp_set_approval` executes `approver_id = auth.uid()`, which **overwrites** the approver
chosen at data entry ("Send to approver"). So one column carries two different meanings and
the original routing target is destroyed the moment a record is approved. This is why the
reference can show *both* "Approval Requested For" and "Approved By" and we cannot.

### Backend gap analysis

| # | Gap | 1. Reference behaviour | 2. We support | 3. Missing object | 4. Migration? | 5. Backfill? | 6. RLS | 7. RPC | 8. UI | 9. Risk | 10. Recommendation |
|---|---|---|---|---|---|---|---|---|---|---|---|
| B1 | `approved_at` | Shows approval timestamp and computes "Avg approval" / "Approved 30d" | Nothing — no timestamp | `insp_records.approved_at timestamptz` | Yes (additive) | Optional; historic rows stay null (never `updated_at`, which is not approval time) | None — inherits row policies | `insp_set_approval` must set `approved_at = now()` on approve, `null` on reject | Unlocks 2 dashboard tiles now showing `—` | **Low** | Do it. Add column + one line in the RPC. Leave history null and label the tiles "since tracking began". |
| B2 | Approved By | Distinct from the requested approver | Only the overloaded `approver_id` | `insp_records.approved_by uuid references auth.users(id)` | Yes (additive) | Ambiguous: existing `approver_id` on approved rows is already the approver, so copy it to `approved_by` where `approve_status='approved'` | None | RPC sets `approved_by = auth.uid()` and **stops overwriting** `approver_id` | Adds the reference's "Approved By" column | **Medium** — changes RPC semantics | Do it with B1 and B3 as one change; they are the same defect. |
| B3 | Approval Requested For | Preserved for the life of the record | Destroyed on approval (see defect above) | No new column; stop overwriting `approver_id` | Yes (RPC change) | Cannot be recovered for already-approved rows — permanently lost | None | Remove `approver_id = auth.uid()` from `insp_set_approval` | "Approval Requested For" becomes truthful | **Medium** | Highest-value fix here: it is a live data-loss bug, not cosmetic. |
| B4 | Companies Description | Column shown in the list | `insp_companies` has no description | `insp_companies.description text not null default ''` | Yes (additive) | No — blank is correct | Existing catalog policies cover it | None | Fills a column now rendering `—` | **Very low** | Do it. |
| B5 | Units → Company | Units list shows an owning Company | `units` has no company reference; Companies' "Units" count is a total, not per-company | `units.company_id uuid references insp_companies(id)` | Yes (additive, nullable) | Yes — 34 units must be assigned; cannot be inferred automatically | `units` is shared with Tubular/WCE — verify no policy assumes the current shape | None | Fixes Units.Company and makes the Companies unit count real | **Medium** — shared table | Add nullable column, backfill by hand or via an admin screen, then make the count per-company. |
| B6 | SAP Equipment # | Shown on equipment detail | Nothing | `insp_equipment_types.sap_equipment_no text` | Yes (additive) | Yes if the numbers matter; otherwise blank | Catalog policies cover it | None | Two more fields on the detail page | **Very low** | Add only if SAP numbers are actually maintained; otherwise skip — an always-empty field is worse than none. |
| B7 | SAP Asset # | As above | Nothing | `insp_equipment_types.sap_asset_no text` | Yes | As above | As above | None | As above | **Very low** | As above; pair with B6. |
| B8 | Shared Documents | Named, rig-scoped document sets linked to many records | `insp_files` only (one file → one record) | New `insp_document_sets` (id, name, unit_id, description, created_by, created_at) + join `insp_document_set_records` (set_id, record_id) | Yes — 2 tables + policies | No — starts empty | Real work: new RLS on both tables, reusing `has_insp_perm('insp_view'/'insp_manage_files')` | Optional CRUD RPCs; plain RLS writes are sufficient | Turns the stub page into a working feature | **Medium–High** — largest item | Defer to its own change. Nothing else depends on it. |
| B9 | P&ID integration | Lists Unit, Company, Inspector, Status, Components | `public.projects` **already exists** (RLS on, 4 rows) with unit_id, rig_name, inspector, revision, version, data | No new table. Needs a read path from the inspection module, plus `status` (derivable from revision/version) and Company (depends on B5) | No migration for a read-only list | No | **Important**: `projects` has its own policies. Reading it from this module must go through those policies — do not add a permissive policy to make the page work | None needed for read-only | Populates Unit / Inspector / Components immediately | **Low** if read-only | Do a read-only listing now (3 of 5 columns real); Company after B5; Status once its meaning is defined. |
| B10 | Frequency table 9 rows vs our 8 | A real, editable admin table (9 rows) | Two TypeScript constants mirrored by CHECK constraints on `insp_records` | `insp_inspection_frequencies` (id, label, unit, amount, major, intermediate, position, active) | Yes — table + seed, and the CHECKs must be relaxed or replaced with an FK | Yes — seed the 8 existing values and reconcile the 9th | New table needs read/write policies (`insp_view` / privileged) | `insp_import_records` and the entry form validate against the constants; both would switch to the table | Makes the page editable rather than read-only | **Medium–High** — touches a CHECK constraint guarding 6,426 rows | Only worth doing if operations genuinely need to edit frequencies. Otherwise keep the constants and accept a read-only page. **Identify the reference's 9th value first** — we could not read it before the session expired. |

### Recommended order

1. **B3 + B2 + B1 together** — one migration plus an `insp_set_approval` change. Fixes a real
   data-loss bug and lights up two dashboard tiles.
2. **B4** — trivial.
3. **B9 read-only** — no migration.
4. **B5** — needs a human to assign 34 units.
5. **B6/B7** — only if SAP numbers are maintained.
6. **B8**, then **B10** — largest and least urgent.

### Specification field duplicates — resolved in the UI, no data change

The catalog holds 8 specifications under two spellings each, differing only in the unit
suffix: `Diameters (in)`/`Diameters(in)`, `Inner Diameter (in)`/`Inner Diameter(in)`,
`Length (m)`/`Length(m)`, `Outer Diameter (in)`/`Outer Diameter(in)`, `Size (in)`/`Size(in)`,
`Type`/`Type()`, `Type of Connection`/`Type of Connection()`,
`Working Pressure (Psi)`/`Working Pressure(Psi)`.

Record data uses **only the compact spellings** (2,212 values: Working Pressure 955,
Size 815, Type 167, Length 111, Type of Connection 96, Inner Diameter 46, Outer Diameter 18,
Diameters 4). The spaced spellings came from the 0029 seed and have **zero** records.

Rather than rewrite 2,212 jsonb keys, the Specifications band now groups fields by base name
(trailing parenthetical stripped) and reads the value from whichever spelling the record
stored. Verified by query that stripping the suffix merges **only** these 8 duplicate pairs
and never two genuinely different fields. Result: 15 clean specification columns, no
duplicates, headers matching the reference's style (`Size`, `Working Pressure`). Sorting the
`Size` column returns real values (`K20`, `5000`, `300 Gal`), proving alias resolution works.

A future data normalisation is still *optional*: `update insp_equipment_types set spec_fields
= <compact forms>` would align the catalog with the data with zero record rewrites, because
the spaced forms are unused. Not done here — it is a data change, and the UI no longer needs it.

## 8d. Fourth pass — final closure (2026-08-14, reference re-authenticated)

The two items previously left unverified were captured from the live reference and are now
implemented exactly rather than approximated.

**Dashboard KPI icons** (read from the reference's own cards, replacing the earlier
stand-ins): Compliance Score `shield-check`, Overdue `triangle-alert`, Due next 30
`calendar-clock`, Coverage `chart-pie`, Avg approval `stamp`. Four of the five stand-ins had
been wrong.

**Per-band controls in the grouped header.** Each band label is followed by:

- a `sliders-horizontal` icon button, `aria-label="<Band> column visibility"`,
  `aria-haspopup="menu"` — opens the Columns menu **scoped to that band** (a `Reset columns`
  action plus only that band's toggleable columns);
- a `chevron-down` icon button, `aria-label="Collapse <Band>"`, flipping to
  `"Expand <Band>"` — collapsing a band hides its columns down to the pinned one (collapsing
  Equipment takes it from colspan 7 to 1, leaving `Unit`).

A band with no toggleable columns gets only the chevron — which is why the reference's
`Additional` band shows a chevron alone. Reproduced, including the exact aria-label wording.

**Bug found while verifying.** On a cold load all 15 Specification columns appeared. The
`hidden` set initialises at mount, but the Specifications band is derived from the catalog,
which loads asynchronously — so those columns did not exist yet and never received their
`defaultHidden`. `DataTable` now applies `defaultHidden` to each column the first time it is
seen, so late-arriving columns start hidden without overriding a user's later choice.

After the fix the defaults match the reference exactly: visible columns Unit, Company,
Serial, Equipment, Part, Component, Status, Intermediate Due, Major Due, Approve Status,
Remarks, with band colspans **7 / 2 / 1 / 1**.

### Verified this pass

- **RPC security**: `has_insp_perm`, `insp_set_approval`, `insp_bulk_update_dates`,
  `insp_import_records` are all SECURITY DEFINER with EXECUTE granted to `authenticated`
  only — `anon` and `public` revoked.
- **Guard is live**: calling `insp_set_approval` from a privileged Postgres connection with
  no `auth.uid()` raised `permission denied: insp_approve required`. It cannot be bypassed.
- **Approval workflow** (inside a transaction that was rolled back): trigger produced
  `intermediate_due=2027-01-31` / `major_due=2031-01-31`; new record defaulted to
  `pending_approval`; approve → `approved` (1 row); reject → `rejected` with reason;
  bulk update recomputed `2027-03-31` / `2031-03-31`; audit log wrote 3 entries.
  Afterwards: 0 scratch rows, record count still 6,426, 0 scratch audit entries.
- **Responsive** (via Chrome DevTools page resize, which drives the real viewport):
  at **1002px** the sidebar is `display:none` / `position:fixed`, main padding 16px;
  the toggle opens it as a 256px fixed overlay at top 56px with z-index 45 and a shadow,
  and navigating auto-closes it. At **602px** the page header stacks, the brand wordmark and
  avatar name hide, tables scroll inside their own container, and there is **no horizontal
  page overflow** (`scrollWidth === clientWidth === 602`).
- **Icons**: every sidebar, toolbar, topbar and row-action glyph is the Lucide icon the
  reference uses; zero unicode icon spans remain.

## 8e. Certificate PDF extraction — **enhancement beyond reference parity**

> **This is not a reference feature.** The reference application has no equivalent, and
> nothing here was copied from it. It is an addition requested separately, recorded in this
> document only because it lives inside the same module. It is deliberately excluded from
> every parity claim above.

Uploading (or opening) a certificate PDF on a record offers to read its fields and prefill
the record.

**How it works**
- Text is extracted **in the browser** with pdf.js. The file is never sent anywhere to be read.
- **No AI service and no API key** are involved for PDFs that carry a text layer — extraction
  is label-based, deterministic and auditable.
- pdf.js is **lazy-loaded** as its own build chunk (~1.26 MB) and is fetched only when someone
  actually reads a certificate, so normal page loads are unaffected.

**What the reviewer sees** — for every field: the extracted value, a confidence level, the
record's current value for comparison, and the **exact source line** the value was read from.

**Safety invariants** (all enforced in code, and unit-tested in `certificateExtract.test.ts`)
- Nothing is written until the user ticks fields and presses **Apply**; there is no silent save.
- Applying requires the **`insp_data_entry`** permission; without it the controls are disabled
  and the RLS policy rejects the write regardless.
- **Approval status is never touched** — extraction cannot move a record through, or around,
  the approval queue.
- **Due dates are never written.** The certificate's stated expiry is shown for validation
  only; the trigger from migration **0030** remains the sole authority for calculated
  `*_due_date` values. The write surface is the `CertificatePatch` type, which has no member
  for a due date or an approval field, so widening it is the only way to break this.
- The user chooses whether the certificate updates the **Major or Intermediate** schedule;
  it is never guessed.

**Document handling**
- A **multi-page PDF is treated as one certificate per page** — the 13-page sample yields 13
  separate certificates, each with its own report number and serial.
- The certificate whose **serial matches the open record is auto-selected** from that set.
- If the certificate's serial **does not match** the record, a warning is shown before applying.
- **Scans and photographs are detected and rejected cleanly**: when no page carries a text
  layer the panel says so and asks for the digital PDF, rather than emitting guesses.

**Known limitation.** Label patterns are tuned to the Bureau Veritas MPI report (3 of the 4
sample documents). Other issuers will need their labels added. There is **no OCR**, so scanned
or photographed certificates cannot be read at all by this path.

## 9. Not inspected on the reference

After the third pass, only these remain uninspected:

- **Pages this account cannot open**, which are absent from its sidebar and so were never
  reachable: `/users`, `/roles`, `/permissions`, `/scope-templates`, `/admin/audit-logs`,
  `/admin/logs`, `/assistant`.
- **Destructive dialogs.** The reference's delete/confirm modals were not triggered,
  deliberately — exercising them would have mutated live production records.
- **The reference's own record-edit page and Shared Documents / P&ID rows**, which held no
  data for this account (both lists were empty), so their populated states are unknown.

## 10. Known constraints

- The local app requires authentication; the assistant cannot enter credentials, so local
  runtime screenshots were not possible. Verification is source-level plus
  `typecheck` / `lint` / `test` / `build`.
- Reference pages behind permissions this account lacks (`/users`, `/roles`, `/permissions`,
  `/scope-templates`, `/admin/audit-logs`, `/admin/logs`, `/assistant`) are not in the
  sidebar for this account and were not replicated.
- Backend authorization (RLS, SECURITY DEFINER RPCs, `insp_*` grants) is unchanged; the
  reference's client-side behaviour is never allowed to weaken it.
