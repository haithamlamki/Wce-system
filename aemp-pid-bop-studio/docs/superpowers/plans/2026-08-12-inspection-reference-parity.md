# Inspection module — reference-parity batch 2 (live-system audit)

Audit of https://einspection.abrajenergy.com (2026-08-12, logged in as Haitham Al Lamki)
vs `src/modules/inspection`. Screenshots + DOM dumps captured in-session; reference
user guide: `/files/docs/Equipment-Master-Pro-User-Guide.pdf`.

## Reference facts captured

### Dashboard (`/`)
- 24 columns in 4 collapsible groups:
  - **WORK UNIT**: Company, Unit, Equipment Category, Equipment
  - **EQUIPMENT DETAIL**: Equipment Part, Equipment Part Component, Description, OEM,
    Serial Number, Part Number, Equipment Working Status, Specs (ⓘ popover: measurement/value with units)
  - **INSPECTION DETAIL**: Intermediate Inspection Date, Intermediate Inspection Due Date,
    Major Inspection Date, Major Inspection Due Date, Inspection Company,
    Equipment Inspection Status (= approve status: Pending Approval/Approved)
  - **DOCUMENTATION**: OEM Certificate, User Manual, Spare Parts Manual, Drawing,
    Inspection Certificate, Major Inspection Certificate — icon link per row when file exists
- Date cells RAG-colored (red/green/yellow backgrounds on Intermediate + Major date cells).
- VIEW dropdown (only option "Equipment"); INSPECTION STATUS filter: All / Overdue (Red) /
  Due Soon (Yellow) / Compliant (Green).
- **Advanced Search toggles the per-column search row** (not extra columns); Clear Search resets.
- Folder Structure toggles sidebar tree: Company → Hoists/Drilling Rigs → Unit.
- Pagination: First/Prev/numbered/Next/Last, entries-per-page 10/25/50/100/250/500,
  "Showing 1 to 10 of 6,450 entries".

### Equipment Inspection (`/EquipmentInspection`)
- 7 system tabs; sub-tabs Data Display / Data Upload / Data Entry.
- Data Display columns: ☑, FILES (View Inspection Files + View Logs), COMPANY, UNIT,
  EQUIPMENT, EQUIPMENT PART, EQUIPMENT PART COMPONENT, COMPONENT DESCRIPTION, OEM, STATUS,
  SERIAL NUMBER, PART NUMBER, INSPECTION COMPANY, INTERM DATE/DUE/FREQ, MAJOR DATE/DUE/FREQ,
  MANUFACTUREYEAR, REMARKS, APPROVE STATUS, ACTIONS (Edit / Delete / Files). Search box under
  every column. Equipment dropdown + Equipment Part chips; Bulk Update Inspection Dates
  (major + intermediate + Update Dates); Export Data / Export Selected / Folder Structure /
  Advanced Search / Clear Selection.
- Data Upload: info banner + Download Template; Approve User select; Choose File; Upload.
- Data Entry: Approve User* + Save Record; Equipment/Part/Component cascade; Component
  Description; Unit; OEM; Inspection Company; Company (text); Serial/Part Number;
  Status (In Use, Never Been Used, Not Applicable, Defected, Scrapped);
  ManufactureYear; Intermediate Date + Frequency (6 Months, 1–5 Year);
  Major Date + Frequency (6 Months, 1–5, 10, 12 Year); Remarks; dynamic spec fields with
  units, e.g. Diameters(in), Working Pressure(Psi), Testing Pressure(Psi), Size(in),
  Outer/Inner Diameter(in), Length(m), Weight(Kg/m), Type().

### Equipment Components (`/EquipmentComponents`)
- List: CATEGORY / EQUIPMENT / DESCRIPTION + view/edit/delete, + New Component, 176 entries.
- Details page: EQUIPMENT SPECIFICATION bullet list (spec fields with units);
  Equipment Parts accordion (part — description, "N components").

### Inspection Metrics (`/EquipmentInspection/Metrics`)
- Filter by Unit; KPI cards: Total Inspections 6485 / Approved 6059 / Pending Approval 426 /
  Overdue 4550; charts: Equipment Type donut, Status Distribution bar, Monthly Trends line,
  By Category hbar, Company Distribution polar, Unit Distribution bar;
  Upcoming Inspections (Next 30 Days) table: Serial, Equipment Type, Unit, Inspection Type
  badge, Due Date, Days Until Due (red badge, may be negative).

### Library (`/Library`)
- FILE EXPLORER folder tree + file rows (size, date, preview + download).

### Security Management
- Submenu: Password Reset (self-service).
- `/User` list: USER NAME, EMAIL, FIRST NAME, LAST NAME, ROLES, ACTIONS; + New User; global search.
- `/User/Edit/{id}`: User Id, Email, First Name, Last Name, Phone Number, Roles (chips,
  e.g. "Drilling Superintendent"); **Configure Access matrix**: per company → per unit
  (Rig 103…Hoist 5, FLST): Full Access toggle + per-system checkboxes (Circulation System,
  Drilling Equipment, Hoisting System, Others, Power System, Rotary System, Well Control
  Equipment); "Full Access" master + "Navigate to unit" jump.

## Gaps to implement (ours vs reference)

### G1 — Dashboard table parity (RegisterView) [biggest visible gap]
- Show ALL columns always (currently inspection detail + part number/working status/
  inspection company/approve status hide behind "Advanced").
- Grouped, collapsible headers: WORK UNIT / EQUIPMENT DETAIL / INSPECTION DETAIL / DOCUMENTATION.
- RAG-colored date cells (intermediate + major date), driven by compliance lib; drop the
  separate RAG chip column; add "Equipment Inspection Status" column = approve status label.
- DOCUMENTATION: 6 file-kind columns; icon → signed-URL open. Fetch insp_files kinds for
  current page's record ids (one batched query).
- Advanced Search = toggle search row (default hidden); search boxes for all columns incl.
  dates/company/status. VIEW dropdown (single "Equipment" option) for parity.

### G2 — Data Display columns (DataDisplayTab)
- Add COMPANY column (first data col) + COMPONENT DESCRIPTION column.
- Search boxes under every column (dates, freqs, year, remarks included).
- Split actions: FILES col (📎 files + 🗒 logs) right after ☑; ACTIONS col (✎ edit / 🗑 delete)
  at the end. Header "STATUS" for working status, "MANUFACTUREYEAR" → "Manufacture Year".

### G3 — Security Management parity
- Migration 0033: `user_unit_assignments` gains `categories insp_category[] | null`
  (null = full access), plus profile columns `first_name`, `last_name`, `phone`, `job_roles text[]`.
  `assigned_unit_ids()` unchanged (unit-level RLS stays); category grants enforced in UI +
  record RPCs re-check unit only (guide §2 promises unit scoping; category is UX scoping).
- UsersView: First/Last name, Phone, Roles chips input; Configure Access matrix per company →
  unit cards with Full Access toggle + 7 category checkboxes; master Full Access; navigate-to-unit.
- Password Reset view (self-service, supabase.auth.updateUser) under Security Management nav.

### G4 — small parity items
- Data Upload: verify Download Template button exists (lib/template.ts) + info banner text.
- Catalog details: spec list bullets with units — present; keep.
- Metrics: present; Company Distribution stays bar (chart.js polar optional).

### G5 — data parity (needs user action)
- Reference holds 6,450 records + 176-component catalog. Fastest faithful route:
  Dashboard → Export Data (Excel) in the reference, then import via our workbook importer
  (extend to accept the reference export layout / map columns). Requires user to approve the
  download from their logged-in session. Catalog gaps can be derived from the same export
  (Category/Equipment/Part/Component distinct rows).

## Task list
1. G1 RegisterView rebuild (+ files-kind batch fetch in lib/files.ts, tests for filters on new keys).
2. G2 DataDisplayTab columns + search keys (filters.ts: extend applyColumnSearch key map, tests).
3. G3 migration 0033 + UsersView matrix + PasswordResetView + route/nav.
4. G4 verify upload tab bits.
5. G5 propose export/import to user; extend workbookImport mapping if they provide the file.
