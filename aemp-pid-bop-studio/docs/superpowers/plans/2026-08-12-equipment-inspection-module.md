# Equipment Inspection Module ("eInspection v2") Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replicate the live Equipment Master Pro system (https://einspection.abrajenergy.com) as a new `inspection` module inside `aemp-pid-bop-studio`, enhanced with (a) automatic RAG compliance + notification alerts and (b) a files/certificates upgrade with drag-drop upload and expiry tracking.

**Architecture:** A lazy-loaded React module at `src/modules/inspection/` (same pattern as `src/modules/tubular/`) with its own shell, CSS and context, backed by three new Supabase migrations (0029–0031): catalog tables (category → equipment type → part → component, with per-type spec fields), an inspection-records table with server-computed due dates and approval status, and a private storage bucket + metadata table for per-record files and the document library. All authorization is DB-enforced (RLS + SECURITY DEFINER RPCs); client permission helpers only drive the UI.

**Tech Stack:** Vite + React 18 + TypeScript, react-router-dom v6, Supabase (Postgres/RLS/Storage), Chart.js 4, SheetJS (`xlsx`), Vitest.

## Source system captured by live exploration (2026-08-12)

The plan replicates these observed behaviors — treat this section as the spec:

1. **Dashboard (register)** at `/`: one flat table of all 6,438 equipment rows, grouped column bands WORK UNIT (Company, Unit, Equipment Category, Equipment) / EQUIPMENT DETAIL (Equipment Part, Equipment Part Component, Description, OEM, Serial Number, Part Number, Working Status, Specs ⓘ) / INSPECTION DETAIL (Intermediate Inspection Date + Due Date, Major Inspection Date + Due Date, Inspection Company, Equipment Inspection Status = Pending Approval/Approved) / DOCUMENTATION (OEM Certificate, User Manual, Spare Parts Manual, Drawing, Inspection Certificate, Major Inspection Certificate). Per-column search boxes, pagination (10/25/50/100/250/500), Export Data, **Folder Structure** toggle (tree sidebar: Company → Unit drill-down; Abraj Oman / Abraj Kuwait), Clear Search, **Advanced Search** toggle (reveals all column bands), INSPECTION STATUS filter: All / Overdue (Red) / Due Soon (Yellow) / Compliant (Green).
2. **Equipment Inspection** page: 7 category tabs — Well Control Equipment, Hoisting System, Circulation System, Drilling Equipment, Rotary System, Power System, Others. Each has 3 sub-tabs:
   - **Data Display**: Equipment dropdown (e.g. Well Control has 23 types: Air pump, Annular BOP, Bonnet, BOP Control unit, BOP Test Stump, Chart Recorder, Choke Line, Choke Manifold, Double Ram Preventer, Drilling Spools and Adapters, Electrical Pump, Gray valve, Kill Line, Kill manifold, Mud Gas Seperator (MGS), Safety Valve, Saver Subs, Single Ram BOP, Single Ram Preventer, Stripping Bottle, Test Plug, Test Pump, Vacuum Degasser) + Equipment Part multi-select chips; row checkboxes + **Bulk Update Inspection Dates** (Major / Intermediate date pickers + Update Dates); columns as dashboard plus Intermediate/Major Inspection Frequency (6 Months–12 Year), ManufactureYear, Remarks, Approve Status; Export Data / Export Selected; per-row FILES icons.
   - **Data Upload**: Download Template button, Approve User dropdown (named approver), file chooser, Upload (Excel bulk import lands as Pending Approval).
   - **Data Entry**: single-record form — Approve User*, Equipment, Equipment Part, Equipment Part Component, Component Description, Unit (Rig 103–Rig 401, Hoist 1–5, FLST), OEM, Inspection Company, Company, Serial Number, Part Number, Status (In Use / Never Been Used / Not Applicable / Defected / Scrapped), ManufactureYear, Intermediate Inspection Date + Frequency (6 Months, 1–5 Year), Major Inspection Date + Frequency (6 Months, 1–5, 10, 12 Year), Remarks, plus per-type spec fields (Diameters(in), Working Pressure(Psi), Testing Pressure(Psi), Size(in), Outer Diameter(in), Inner Diameter(in), Length(m), Weight(Kg/m), Type()).
3. **Equipment Components** (catalog admin): CRUD list (178 rows) of Category / Equipment / Description with view/edit/delete + New Component; detail page shows the type's EQUIPMENT SPECIFICATION field list and its Equipment Parts, each expandable to N components.
4. **Inspection Metrics**: Filter-by-Unit; KPI cards Total Inspections / Approved / Pending Approval / Overdue Inspections; charts: Equipment Type Distribution (doughnut), Status Distribution (bar), Monthly Inspection Trends, By Category, Company Distribution, Unit Distribution; "Upcoming Inspections (Next 30 Days)" table (Serial Number, Equipment Type, Unit, Inspection Type, Due Date, Days Until Due — negative = overdue).
5. **Library**: file-explorer (folder tree + files list with size/date/preview/download) serving PDFs (user guide, inspection manual).
6. **Security Management → Password Reset** (already covered by the app's existing auth; not rebuilt).

**Enhancements in scope (user-selected):**
- **Compliance & alerts**: RAG status computed automatically from due dates (no manual field), notification bell listing Overdue / Due Soon (≤30 days) inspections and expiring certificates.
- **Files & certificates upgrade**: drag-drop multi-file upload per record, typed as the 6 documentation kinds + Other, with optional expiry date on certificates feeding the alerts.

**Out of scope (explicitly):** approval-queue redesign (keep source-style approve status + approver), SSO/user-admin screens, migrating the 6,438 production rows (catalog structure is seeded; records arrive via Data Upload/Entry).

## Global Constraints

- All work happens inside `aemp-pid-bop-studio/` (repo root `C:\projects\Faisal Rig WCE drowing`).
- Keep files under 500 lines (project rule). Split before exceeding.
- NEVER commit secrets or .env files.
- Migrations are additive and numbered `0029_…`, `0030_…`, `0031_…` in `supabase/migrations/`; they must not break existing WCE/Tubular objects. Apply each to the linked Supabase project (MCP tool `apply_migration`, or `npx supabase db push`) before the frontend task that consumes it.
- `user_module_permissions.permission` is a flat string list shared with Tubular — inspection permissions are namespaced `insp_*`.
- The DB (RLS + SECURITY DEFINER RPCs with `set search_path = public`) is the authorization boundary; client helpers only drive UI. Mirror `has_tubular_perm()` style. Revoke anon/public execute on every new function (0013 pattern).
- `supabase` client import is `import { supabase } from '../../../lib/supabase'` and its type is `SupabaseClient | null` — every service function must guard null.
- Run tests with `npx vitest run <file>` from `aemp-pid-bop-studio/`; full gates: `npm run typecheck && npm run lint && npm test && npm run build`.
- Commit after every task (conventional commits, e.g. `feat(inspection): …`). No Co-Authored-By trailer.
- Dates are ISO `YYYY-MM-DD` strings end-to-end; due-soon window = 30 days.

## File Structure

```
supabase/migrations/
  0029_inspection_foundation.sql      # enums, catalog tables, companies, perms, RLS, seeds
  0030_inspection_records.sql         # records, due-date trigger, RPCs, expanded view, audit
  0031_inspection_files.sql           # buckets, insp_files, storage policies, library
src/modules/inspection/
  InspectionModule.tsx                # shell + routes (lazy-loaded from App.tsx)
  inspection.css                      # .insp-app design (reuses global theme tokens)
  types.ts                            # all shared TS types + labels/constants
  state/InspectionContext.tsx         # access gate, grants, catalogs, units, companies
  components/shell/InspectionTopbar.tsx
  components/shell/InspectionTabNav.tsx
  components/NotificationsBell.tsx    # enhancement: alerts dropdown
  components/FilesDrawer.tsx          # enhancement: drag-drop files per record
  components/SpecsPopover.tsx         # ⓘ specs viewer used by tables
  lib/permissions.ts + .test.ts       # pure permission helpers
  lib/compliance.ts + .test.ts        # due dates, RAG status, cert expiry, alerts
  lib/records.ts                      # data access (catalog, records, RPCs)
  lib/filters.ts + .test.ts           # pure filter/pagination query helpers
  lib/exportCsv.ts + .test.ts         # filtered rows → CSV
  lib/template.ts                     # upload template workbook builder
  lib/workbookImport.ts + .test.ts    # template parse + validation
  lib/files.ts                        # storage upload/list/delete + metadata
  views/RegisterView.tsx              # Dashboard/register (folder tree, RAG, search)
  views/RecordsView.tsx               # category tabs + Display/Upload/Entry subtabs
  views/DataEntryForm.tsx             # single-record form
  views/DataUploadView.tsx            # template download + import
  views/CatalogView.tsx               # Equipment Components CRUD
  views/MetricsView.tsx               # KPIs + charts + upcoming table
  views/LibraryView.tsx               # document library explorer
Modify:
  src/App.tsx                         # lazy route /inspection/*, hide appbar in module
  src/views/HomeView.tsx              # module card
```

---

### Task 1: Migration 0029 — inspection foundation (enums, catalogs, permissions, seeds)

**Files:**
- Create: `supabase/migrations/0029_inspection_foundation.sql`

**Interfaces:**
- Consumes: existing `public.units` (0014), `public.user_module_permissions` (0014), `public.is_privileged()` (0003/0014).
- Produces: enums `insp_category`, `insp_working_status`, `insp_approve_status`; tables `insp_companies`, `insp_equipment_types`, `insp_equipment_parts`, `insp_part_components`; function `has_insp_perm(p text) returns boolean`; permission strings `insp_view, insp_data_entry, insp_approve, insp_upload, insp_manage_catalog, insp_manage_files, insp_export`. Later tasks rely on these exact names.

- [ ] **Step 1: Read the two migrations this builds on**

Read `supabase/migrations/0014_tubular_foundation.sql` (units table, user_module_permissions, helper style) and `0013_revoke_anon_rpc_execute.sql` (revoke pattern). The permission check constraint in 0014 is inline/unnamed, so Postgres named it `user_module_permissions_permission_check`.

- [ ] **Step 2: Write the migration**

```sql
-- ============================================================================
--  0029_inspection_foundation.sql — Equipment Inspection module: foundation.
--  Replicates einspection.abrajenergy.com catalog structure:
--  category (enum) → equipment type → part → component, plus companies and
--  namespaced insp_* module permissions. Additive only.
-- ============================================================================

do $$ begin
  create type public.insp_category as enum
    ('well_control','hoisting','circulation','drilling','rotary','power','others');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.insp_working_status as enum
    ('in_use','never_been_used','not_applicable','defected','scrapped');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.insp_approve_status as enum
    ('pending_approval','approved','rejected');
exception when duplicate_object then null; end $$;

-- units: allow FLST-style units and seed the ones the source system has
alter table public.units drop constraint if exists units_unit_type_check;
alter table public.units
  add constraint units_unit_type_check check (unit_type in ('rig','hoist','other'));
insert into public.units (name, unit_type) values
  ('Rig 112','rig'), ('Rig 211','rig'), ('Rig 307','rig'), ('Rig 401','rig'),
  ('FLST','other')
on conflict (name) do nothing;

create table if not exists public.insp_companies (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  active     boolean not null default true,
  created_at timestamptz not null default now()
);
insert into public.insp_companies (name) values ('Abraj Oman'), ('Abraj Kuwait')
on conflict (name) do nothing;

create table if not exists public.insp_equipment_types (
  id          uuid primary key default gen_random_uuid(),
  category    public.insp_category not null,
  name        text not null,
  description text not null default '',
  spec_fields jsonb not null default '[]'::jsonb,  -- e.g. ["Size (in)","Length (m)"]
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  unique (category, name)
);

create table if not exists public.insp_equipment_parts (
  id          uuid primary key default gen_random_uuid(),
  type_id     uuid not null references public.insp_equipment_types(id) on delete cascade,
  name        text not null,
  description text not null default '',
  position    int  not null default 0,
  unique (type_id, name)
);

create table if not exists public.insp_part_components (
  id          uuid primary key default gen_random_uuid(),
  part_id     uuid not null references public.insp_equipment_parts(id) on delete cascade,
  name        text not null,
  description text not null default '',
  position    int  not null default 0,
  unique (part_id, name)
);

-- permissions: extend the shared flat list with namespaced insp_*
alter table public.user_module_permissions
  drop constraint if exists user_module_permissions_permission_check;
alter table public.user_module_permissions
  add constraint user_module_permissions_permission_check check (permission in (
    'view','view_fleet','data_entry','approve_movements','approve_orders',
    'manage_orders','manage_catalog','manage_contracts','import','export',
    'manage_assignments',
    'insp_view','insp_data_entry','insp_approve','insp_upload',
    'insp_manage_catalog','insp_manage_files','insp_export'
  ));

create or replace function public.has_insp_perm(p text) returns boolean
  language sql security definer stable set search_path = public as
$$ select public.is_privileged()
     or exists (select 1 from public.user_module_permissions
                where user_id = auth.uid() and permission = p) $$;

revoke all on function public.has_insp_perm(text) from public;
revoke execute on function public.has_insp_perm(text) from anon;
grant execute on function public.has_insp_perm(text) to authenticated;

alter table public.insp_companies        enable row level security;
alter table public.insp_equipment_types  enable row level security;
alter table public.insp_equipment_parts  enable row level security;
alter table public.insp_part_components  enable row level security;

drop policy if exists insp_companies_read on public.insp_companies;
create policy insp_companies_read on public.insp_companies
  for select to authenticated using (public.has_insp_perm('insp_view'));
drop policy if exists insp_companies_write on public.insp_companies;
create policy insp_companies_write on public.insp_companies
  for all to authenticated
  using (public.has_insp_perm('insp_manage_catalog'))
  with check (public.has_insp_perm('insp_manage_catalog'));

drop policy if exists insp_types_read on public.insp_equipment_types;
create policy insp_types_read on public.insp_equipment_types
  for select to authenticated using (public.has_insp_perm('insp_view'));
drop policy if exists insp_types_write on public.insp_equipment_types;
create policy insp_types_write on public.insp_equipment_types
  for all to authenticated
  using (public.has_insp_perm('insp_manage_catalog'))
  with check (public.has_insp_perm('insp_manage_catalog'));

drop policy if exists insp_parts_read on public.insp_equipment_parts;
create policy insp_parts_read on public.insp_equipment_parts
  for select to authenticated using (public.has_insp_perm('insp_view'));
drop policy if exists insp_parts_write on public.insp_equipment_parts;
create policy insp_parts_write on public.insp_equipment_parts
  for all to authenticated
  using (public.has_insp_perm('insp_manage_catalog'))
  with check (public.has_insp_perm('insp_manage_catalog'));

drop policy if exists insp_components_read on public.insp_part_components;
create policy insp_components_read on public.insp_part_components
  for select to authenticated using (public.has_insp_perm('insp_view'));
drop policy if exists insp_components_write on public.insp_part_components;
create policy insp_components_write on public.insp_part_components
  for all to authenticated
  using (public.has_insp_perm('insp_manage_catalog'))
  with check (public.has_insp_perm('insp_manage_catalog'));

-- ---- seeds: captured live from einspection.abrajenergy.com (2026-08-12) -------
insert into public.insp_equipment_types (category, name, description, spec_fields) values
  ('well_control','Air pump','Air pump','["Diameters (in)","Working Pressure (Psi)","Testing Pressure (Psi)"]'),
  ('well_control','Annular BOP','Annular BOP','["Diameters (in)","Working Pressure (Psi)","Testing Pressure (Psi)"]'),
  ('well_control','Bonnet','Bonnet','["Diameters (in)","Working Pressure (Psi)","Testing Pressure (Psi)"]'),
  ('well_control','BOP Control unit','BOP Control unit','["Working Pressure (Psi)","Testing Pressure (Psi)"]'),
  ('well_control','BOP Test Stump','BOP Test Stump','["Diameters (in)","Working Pressure (Psi)","Testing Pressure (Psi)"]'),
  ('well_control','Chart Recorder','Chart Recorder','["Working Pressure (Psi)"]'),
  ('well_control','Choke Line','Choke Line','["Size (in)","Working Pressure (Psi)","Testing Pressure (Psi)","Length (m)"]'),
  ('well_control','Choke Manifold','Choke Manifold','["Diameters (in)","Working Pressure (Psi)","Testing Pressure (Psi)"]'),
  ('well_control','Double Ram Preventer','Double Ram Preventer','["Diameters (in)","Working Pressure (Psi)","Testing Pressure (Psi)"]'),
  ('well_control','Drilling Spools and Adapters','Drilling Spools and Adapters','["Diameters (in)","Working Pressure (Psi)","Testing Pressure (Psi)"]'),
  ('well_control','Electrical Pump','Electrical Pump','["Working Pressure (Psi)","Testing Pressure (Psi)"]'),
  ('well_control','Gray valve','Gray valve','["Diameters (in)","Working Pressure (Psi)","Testing Pressure (Psi)"]'),
  ('well_control','Kill Line','Kill Line','["Size (in)","Working Pressure (Psi)","Testing Pressure (Psi)","Length (m)"]'),
  ('well_control','Kill manifold','Kill manifold','["Diameters (in)","Working Pressure (Psi)","Testing Pressure (Psi)"]'),
  ('well_control','Mud Gas Seperator (MGS)','Mud Gas Seperator (MGS)','["Size (in)","Working Pressure (Psi)"]'),
  ('well_control','Safety Valve','Safety Valve','["Diameters (in)","Working Pressure (Psi)","Testing Pressure (Psi)"]'),
  ('well_control','Saver Subs','Saver Subs','["Size (in)","Type"]'),
  ('well_control','Single Ram BOP','Single Ram BOP','["Diameters (in)","Working Pressure (Psi)","Testing Pressure (Psi)"]'),
  ('well_control','Single Ram Preventer','Single Ram Preventer','["Diameters (in)","Working Pressure (Psi)","Testing Pressure (Psi)"]'),
  ('well_control','Stripping Bottle','Stripping Bottle','["Working Pressure (Psi)"]'),
  ('well_control','Test Plug','Test Plug','["Size (in)","Working Pressure (Psi)"]'),
  ('well_control','Test Pump','Test Pump','["Working Pressure (Psi)","Testing Pressure (Psi)"]'),
  ('well_control','Vacuum Degasser','Vacuum Degasser','["Size (in)"]')
on conflict (category, name) do nothing;

insert into public.insp_equipment_types (category, name, description, spec_fields) values
  ('circulation','High Pressure Hose','High Pressure Hose','["Size (in)","Outer Diameter (in)","Inner Diameter (in)","Type of Connection","Length (m)"]'),
  ('circulation','Cooling Water Tank','Cooling Water Tank','[]'),
  ('circulation','Standpipe manifold','Standpipe manifold','["Size (in)","Working Pressure (Psi)","Testing Pressure (Psi)"]'),
  ('circulation','Cement manifold','Cement manifold','["Size (in)","Working Pressure (Psi)"]'),
  ('circulation','Mud Pump','Mud Pump','["Working Pressure (Psi)"]'),
  ('circulation','Centrifugal Pump','Centrifugal Pump','[]'),
  ('circulation','Mud Conditioner','Mud Conditioner','[]'),
  ('circulation','Mixing Unit','Mixing Unit','[]'),
  ('circulation','Trip Pump','Trip Pump','[]'),
  ('circulation','Shale Shaker','Shale Shaker','[]')
on conflict (category, name) do nothing;

-- "Hoisting & Winches" lives under Others in the source system; kept for parity.
insert into public.insp_equipment_types (category, name, description, spec_fields) values
  ('others','Hoisting & Winches','Hoisting & Winches','[]'),
  ('others','Power catwalk','Power catwalk','[]'),
  ('others','Ground Manifold','Ground Manifold','["Size (in)","Working Pressure (Psi)"]'),
  ('others','Rig Skids','Rig Skids','[]'),
  ('others','Slips','Slips','["Size (in)"]'),
  ('others','Elevators','Elevators','["Size (in)"]'),
  ('others','Lifting Cap','Lifting Cap','["Size (in)"]')
on conflict (category, name) do nothing;

insert into public.insp_equipment_parts (type_id, name, description, position)
select t.id, p.name, p.name, p.pos
from public.insp_equipment_types t
join (values
  ('well_control','Air pump','Air pump 1',1),
  ('well_control','Air pump','Air pump 2',2),
  ('well_control','Air pump','Air pump 3',3),
  ('well_control','Annular BOP','ANNULAR BOP BODY',1),
  ('well_control','Annular BOP','Annular Element',2),
  ('others','Hoisting & Winches','Mobile Elevated Work Plate Form ( MEWP )',1),
  ('circulation','Standpipe manifold','High Pressure Pipe',1)
) as p(cat, type_name, name, pos)
  on t.category = p.cat::public.insp_category and t.name = p.type_name
on conflict (type_id, name) do nothing;

insert into public.insp_part_components (part_id, name, description, position)
select ep.id, c.name, c.name, c.pos
from public.insp_equipment_parts ep
join (values
  ('High Pressure Pipe','High Pressure Pipe 4 Inch',1)
) as c(part_name, name, pos) on ep.name = c.part_name
on conflict (part_id, name) do nothing;
```

- [ ] **Step 3: Apply the migration to the linked Supabase project**

Use MCP `mcp__claude_ai_Supabase__apply_migration` with name `0029_inspection_foundation` and the file content (or `npx supabase db push` if the CLI is linked). Expected: success.

- [ ] **Step 4: Verify with SQL probes**

Run via MCP `execute_sql`:

```sql
select
  (select count(*) from public.insp_equipment_types)  as types,     -- expect 40
  (select count(*) from public.insp_equipment_parts)  as parts,     -- expect 7
  (select count(*) from public.insp_companies)        as companies, -- expect 2
  (select count(*) from public.units where name in
     ('Rig 112','Rig 211','Rig 307','Rig 401','FLST')) as new_units; -- expect 5
```

Also verify tubular is unbroken: `select count(*) from public.user_module_permissions;` returns without error (constraint swap kept existing rows valid).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0029_inspection_foundation.sql
git commit -m "feat(inspection): foundation migration - catalog, companies, insp_* permissions"
```

### Task 2: Migration 0030 — inspection records, due-date trigger, RPCs

**Files:**
- Create: `supabase/migrations/0030_inspection_records.sql`

**Interfaces:**
- Consumes: Task 1 objects (`insp_equipment_types/parts/components`, `insp_companies`, `has_insp_perm`, enums), `public.units`, `auth.users`.
- Produces: table `insp_records`; view `insp_records_expanded` (adds `category, type_name, part_name, component_name, unit_name, company_name`); RPCs `insp_bulk_update_dates(p_ids uuid[], p_major date, p_intermediate date) returns int`, `insp_set_approval(p_ids uuid[], p_approve boolean, p_reason text) returns int`, `insp_import_records(p_rows jsonb) returns int`; audit table `insp_audit_log`. Frontend Tasks 6–13 depend on these exact names and columns.

- [ ] **Step 1: Write the migration**

```sql
-- ============================================================================
--  0030_inspection_records.sql — inspection records + server-computed due
--  dates + approval / bulk-update / import RPCs. Due dates are ALWAYS derived
--  (date + frequency) by trigger; the client never writes *_due_date.
-- ============================================================================

create table if not exists public.insp_records (
  id                       uuid primary key default gen_random_uuid(),
  type_id                  uuid not null references public.insp_equipment_types(id),
  part_id                  uuid references public.insp_equipment_parts(id),
  component_id             uuid references public.insp_part_components(id),
  unit_id                  uuid not null references public.units(id),
  company_id               uuid references public.insp_companies(id),
  component_description    text not null default '',
  oem                      text not null default '',
  inspection_company       text not null default '',
  serial_number            text not null default '',
  part_number              text not null default '',
  working_status           public.insp_working_status not null default 'in_use',
  manufacture_year         int check (manufacture_year is null or manufacture_year between 1950 and 2100),
  intermediate_date        date,
  intermediate_freq_months smallint check (intermediate_freq_months is null or intermediate_freq_months in (6,12,24,36,48,60)),
  intermediate_due_date    date,
  major_date               date,
  major_freq_months        smallint check (major_freq_months is null or major_freq_months in (6,12,24,36,48,60,120,144)),
  major_due_date           date,
  remarks                  text not null default '',
  specs                    jsonb not null default '{}'::jsonb, -- {"Size (in)":"13 5/8", ...}
  approve_status           public.insp_approve_status not null default 'pending_approval',
  approver_id              uuid references auth.users(id),
  reject_reason            text,
  created_by               uuid not null default auth.uid() references auth.users(id),
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

create index if not exists insp_records_unit_idx    on public.insp_records(unit_id);
create index if not exists insp_records_type_idx    on public.insp_records(type_id);
create index if not exists insp_records_status_idx  on public.insp_records(approve_status);
create index if not exists insp_records_idue_idx    on public.insp_records(intermediate_due_date);
create index if not exists insp_records_mdue_idx    on public.insp_records(major_due_date);
create index if not exists insp_records_serial_idx  on public.insp_records(serial_number);

create or replace function public.insp_set_due_dates() returns trigger
  language plpgsql as $$
begin
  new.intermediate_due_date :=
    case when new.intermediate_date is null or new.intermediate_freq_months is null
         then null
         else (new.intermediate_date + make_interval(months => new.intermediate_freq_months))::date end;
  new.major_due_date :=
    case when new.major_date is null or new.major_freq_months is null
         then null
         else (new.major_date + make_interval(months => new.major_freq_months))::date end;
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists insp_records_due_dates on public.insp_records;
create trigger insp_records_due_dates
  before insert or update on public.insp_records
  for each row execute function public.insp_set_due_dates();

-- ---- RLS ----------------------------------------------------------------------
alter table public.insp_records enable row level security;

drop policy if exists insp_records_read on public.insp_records;
create policy insp_records_read on public.insp_records
  for select to authenticated using (public.has_insp_perm('insp_view'));

drop policy if exists insp_records_insert on public.insp_records;
create policy insp_records_insert on public.insp_records
  for insert to authenticated
  with check (public.has_insp_perm('insp_data_entry'));

drop policy if exists insp_records_update on public.insp_records;
create policy insp_records_update on public.insp_records
  for update to authenticated
  using (public.has_insp_perm('insp_data_entry'))
  with check (public.has_insp_perm('insp_data_entry'));

drop policy if exists insp_records_delete on public.insp_records;
create policy insp_records_delete on public.insp_records
  for delete to authenticated using (public.is_privileged());

-- ---- expanded read view (labels joined; RLS of base tables applies) ------------
create or replace view public.insp_records_expanded
  with (security_invoker = true) as
select r.*,
       t.category, t.name as type_name, t.spec_fields,
       p.name  as part_name,
       c.name  as component_name,
       u.name  as unit_name,
       co.name as company_name
from public.insp_records r
join public.insp_equipment_types t on t.id = r.type_id
left join public.insp_equipment_parts p on p.id = r.part_id
left join public.insp_part_components c on c.id = r.component_id
join public.units u on u.id = r.unit_id
left join public.insp_companies co on co.id = r.company_id;

-- ---- audit log ------------------------------------------------------------------
create table if not exists public.insp_audit_log (
  id         bigint generated always as identity primary key,
  actor      uuid not null default auth.uid(),
  action     text not null,          -- 'bulk_update_dates' | 'approve' | 'reject' | 'import'
  record_ids uuid[] not null default '{}',
  details    jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
alter table public.insp_audit_log enable row level security;
drop policy if exists insp_audit_read on public.insp_audit_log;
create policy insp_audit_read on public.insp_audit_log
  for select to authenticated using (public.is_privileged());

-- ---- RPCs (SECURITY DEFINER, perm-guarded, audited) ------------------------------
create or replace function public.insp_bulk_update_dates(
  p_ids uuid[], p_major date, p_intermediate date
) returns int
  language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not public.has_insp_perm('insp_data_entry') then
    raise exception 'permission denied: insp_data_entry required';
  end if;
  if p_major is null and p_intermediate is null then
    raise exception 'nothing to update: provide a major and/or intermediate date';
  end if;
  update public.insp_records
     set major_date        = coalesce(p_major, major_date),
         intermediate_date = coalesce(p_intermediate, intermediate_date)
   where id = any(p_ids);
  get diagnostics n = row_count;
  insert into public.insp_audit_log (action, record_ids, details)
  values ('bulk_update_dates', p_ids,
          jsonb_build_object('major', p_major, 'intermediate', p_intermediate));
  return n;
end $$;

create or replace function public.insp_set_approval(
  p_ids uuid[], p_approve boolean, p_reason text default null
) returns int
  language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not public.has_insp_perm('insp_approve') then
    raise exception 'permission denied: insp_approve required';
  end if;
  update public.insp_records
     set approve_status = case when p_approve then 'approved'::public.insp_approve_status
                               else 'rejected'::public.insp_approve_status end,
         reject_reason  = case when p_approve then null else p_reason end,
         approver_id    = auth.uid()
   where id = any(p_ids);
  get diagnostics n = row_count;
  insert into public.insp_audit_log (action, record_ids, details)
  values (case when p_approve then 'approve' else 'reject' end, p_ids,
          jsonb_build_object('reason', p_reason));
  return n;
end $$;

-- Bulk import: array of row objects using the SAME keys as insp_records columns
-- (type_id, part_id, component_id, unit_id, company_id, oem, ... specs).
create or replace function public.insp_import_records(p_rows jsonb) returns int
  language plpgsql security definer set search_path = public as $$
declare n int := 0; r jsonb;
begin
  if not public.has_insp_perm('insp_upload') then
    raise exception 'permission denied: insp_upload required';
  end if;
  for r in select * from jsonb_array_elements(p_rows) loop
    insert into public.insp_records
      (type_id, part_id, component_id, unit_id, company_id, component_description,
       oem, inspection_company, serial_number, part_number, working_status,
       manufacture_year, intermediate_date, intermediate_freq_months,
       major_date, major_freq_months, remarks, specs, approver_id, created_by)
    values
      ((r->>'type_id')::uuid, (r->>'part_id')::uuid, (r->>'component_id')::uuid,
       (r->>'unit_id')::uuid, (r->>'company_id')::uuid,
       coalesce(r->>'component_description',''),
       coalesce(r->>'oem',''), coalesce(r->>'inspection_company',''),
       coalesce(r->>'serial_number',''), coalesce(r->>'part_number',''),
       coalesce(r->>'working_status','in_use')::public.insp_working_status,
       (r->>'manufacture_year')::int,
       (r->>'intermediate_date')::date, (r->>'intermediate_freq_months')::smallint,
       (r->>'major_date')::date, (r->>'major_freq_months')::smallint,
       coalesce(r->>'remarks',''), coalesce(r->'specs','{}'::jsonb),
       (r->>'approver_id')::uuid, auth.uid());
    n := n + 1;
  end loop;
  insert into public.insp_audit_log (action, details)
  values ('import', jsonb_build_object('count', n));
  return n;
end $$;

do $$ declare f text;
begin
  foreach f in array array[
    'insp_bulk_update_dates(uuid[],date,date)',
    'insp_set_approval(uuid[],boolean,text)',
    'insp_import_records(jsonb)'
  ] loop
    execute format('revoke all on function public.%s from public', f);
    execute format('revoke execute on function public.%s from anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
```

- [ ] **Step 2: Apply the migration** (same method as Task 1, name `0030_inspection_records`). Expected: success.

- [ ] **Step 3: Verify with SQL probes**

```sql
-- trigger works: insert a scratch row as service role, then read due dates
insert into public.insp_records (type_id, unit_id, intermediate_date, intermediate_freq_months, major_date, major_freq_months)
select t.id, u.id, date '2026-01-31', 12, date '2026-01-31', 60
from public.insp_equipment_types t, public.units u
where t.name = 'Air pump' and u.name = 'Rig 103' limit 1
returning intermediate_due_date, major_due_date;  -- expect 2027-01-31 and 2031-01-31
delete from public.insp_records where serial_number = '' and oem = '';  -- clean scratch row
select count(*) from public.insp_records_expanded;  -- runs without error
```

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0030_inspection_records.sql
git commit -m "feat(inspection): records table, due-date trigger, approval/bulk/import RPCs"
```

---

### Task 3: Migration 0031 — files, certificates & library storage

**Files:**
- Create: `supabase/migrations/0031_inspection_files.sql`

**Interfaces:**
- Consumes: `insp_records` (Task 2), `has_insp_perm` (Task 1), `storage.buckets` / `storage.objects`.
- Produces: enum `insp_file_kind` (`oem_certificate, user_manual, spare_parts_manual, drawing, inspection_certificate, major_inspection_certificate, other`); private buckets `inspection-files` and `inspection-library`; table `insp_files(id, record_id, kind, storage_path, file_name, file_size, expiry_date, uploaded_by, created_at)`. Tasks 14–16 depend on these names.

- [ ] **Step 1: Write the migration**

```sql
-- ============================================================================
--  0031_inspection_files.sql — per-record documentation files (6 kinds + other,
--  certificates carry an optional expiry_date that feeds alerts) and the
--  document Library bucket. Buckets are PRIVATE; access via signed URLs.
-- ============================================================================

do $$ begin
  create type public.insp_file_kind as enum
    ('oem_certificate','user_manual','spare_parts_manual','drawing',
     'inspection_certificate','major_inspection_certificate','other');
exception when duplicate_object then null; end $$;

insert into storage.buckets (id, name, public)
values ('inspection-files','inspection-files', false),
       ('inspection-library','inspection-library', false)
on conflict (id) do nothing;

create table if not exists public.insp_files (
  id           uuid primary key default gen_random_uuid(),
  record_id    uuid not null references public.insp_records(id) on delete cascade,
  kind         public.insp_file_kind not null default 'other',
  storage_path text not null unique,   -- records/<record_id>/<kind>/<file_name>
  file_name    text not null,
  file_size    bigint not null default 0,
  expiry_date  date,                   -- certificates only; null = no expiry
  uploaded_by  uuid not null default auth.uid() references auth.users(id),
  created_at   timestamptz not null default now()
);
create index if not exists insp_files_record_idx on public.insp_files(record_id);
create index if not exists insp_files_expiry_idx on public.insp_files(expiry_date);

alter table public.insp_files enable row level security;
drop policy if exists insp_files_read on public.insp_files;
create policy insp_files_read on public.insp_files
  for select to authenticated using (public.has_insp_perm('insp_view'));
drop policy if exists insp_files_write on public.insp_files;
create policy insp_files_write on public.insp_files
  for all to authenticated
  using (public.has_insp_perm('insp_manage_files'))
  with check (public.has_insp_perm('insp_manage_files'));

-- storage.objects policies for the two buckets
drop policy if exists insp_files_obj_read on storage.objects;
create policy insp_files_obj_read on storage.objects
  for select to authenticated
  using (bucket_id in ('inspection-files','inspection-library')
         and public.has_insp_perm('insp_view'));

drop policy if exists insp_files_obj_write on storage.objects;
create policy insp_files_obj_write on storage.objects
  for insert to authenticated
  with check (bucket_id in ('inspection-files','inspection-library')
              and public.has_insp_perm('insp_manage_files'));

drop policy if exists insp_files_obj_delete on storage.objects;
create policy insp_files_obj_delete on storage.objects
  for delete to authenticated
  using (bucket_id in ('inspection-files','inspection-library')
         and public.has_insp_perm('insp_manage_files'));
```

- [ ] **Step 2: Apply the migration** (name `0031_inspection_files`). Expected: success.

- [ ] **Step 3: Verify**

```sql
select id from storage.buckets where id in ('inspection-files','inspection-library'); -- 2 rows
select count(*) from public.insp_files; -- 0, no error
```

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0031_inspection_files.sql
git commit -m "feat(inspection): files/certificates storage, insp_files metadata, library bucket"
```

### Task 4: Shared types + permission helpers (TDD)

**Files:**
- Create: `src/modules/inspection/types.ts`
- Create: `src/modules/inspection/lib/permissions.ts`
- Test: `src/modules/inspection/lib/permissions.test.ts`

**Interfaces:**
- Consumes: `Role` type from `src/state/AuthContext` (`'admin' | 'manager' | 'field' | …`).
- Produces (used by every later task):
  - `types.ts`: `InspCategory`, `CATEGORY_ORDER`, `CATEGORY_LABELS`, `WorkingStatus`, `WORKING_STATUS_LABELS`, `ApproveStatus`, `APPROVE_STATUS_LABELS`, `INTERMEDIATE_FREQUENCIES`, `MAJOR_FREQUENCIES`, `frequencyLabel(months: number): string`, `EquipmentType`, `EquipmentPart`, `PartComponent`, `Company`, `InspUnit`, `InspectionRecord`, `FileKind`, `FILE_KIND_LABELS`, `CERTIFICATE_KINDS`, `InspFile`.
  - `permissions.ts`: `INSPECTION_PERMISSIONS`, `InspectionPermission`, `isPrivileged(role)`, `hasPermission(role, granted, perm)`, `canAccessModule(role, granted)`.

- [ ] **Step 1: Write `types.ts`** (pure declarations, no test needed beyond typecheck)

```ts
// ============================================================================
//  Inspection module — shared types & display constants. DB enum values are
//  snake_case; labels reproduce the source system's wording exactly.
// ============================================================================

export type InspCategory =
  | 'well_control' | 'hoisting' | 'circulation' | 'drilling'
  | 'rotary' | 'power' | 'others';

export const CATEGORY_ORDER: InspCategory[] =
  ['well_control', 'hoisting', 'circulation', 'drilling', 'rotary', 'power', 'others'];

export const CATEGORY_LABELS: Record<InspCategory, string> = {
  well_control: 'Well Control Equipment',
  hoisting: 'Hoisting System',
  circulation: 'Circulation System',
  drilling: 'Drilling Equipment',
  rotary: 'Rotary System',
  power: 'Power System',
  others: 'Others',
};

export type WorkingStatus =
  | 'in_use' | 'never_been_used' | 'not_applicable' | 'defected' | 'scrapped';

export const WORKING_STATUS_LABELS: Record<WorkingStatus, string> = {
  in_use: 'In Use',
  never_been_used: 'Never Been Used',
  not_applicable: 'Not Applicable',
  defected: 'Defected',
  scrapped: 'Scrapped',
};

export type ApproveStatus = 'pending_approval' | 'approved' | 'rejected';

export const APPROVE_STATUS_LABELS: Record<ApproveStatus, string> = {
  pending_approval: 'Pending Approval',
  approved: 'Approved',
  rejected: 'Rejected',
};

export const INTERMEDIATE_FREQUENCIES = [6, 12, 24, 36, 48, 60] as const;
export const MAJOR_FREQUENCIES = [6, 12, 24, 36, 48, 60, 120, 144] as const;

/** 6 → "6 Months", 12 → "1 Year", 24 → "2 Year" … (source system wording). */
export function frequencyLabel(months: number): string {
  return months < 12 ? `${months} Months` : `${months / 12} Year`;
}

export interface EquipmentType {
  id: string; category: InspCategory; name: string; description: string;
  specFields: string[]; active: boolean;
}
export interface EquipmentPart {
  id: string; typeId: string; name: string; description: string; position: number;
}
export interface PartComponent {
  id: string; partId: string; name: string; description: string; position: number;
}
export interface Company { id: string; name: string }
export interface InspUnit { id: string; name: string; unitType: 'rig' | 'hoist' | 'other' }

export interface InspectionRecord {
  id: string;
  typeId: string; partId: string | null; componentId: string | null;
  unitId: string; companyId: string | null;
  componentDescription: string; oem: string; inspectionCompany: string;
  serialNumber: string; partNumber: string;
  workingStatus: WorkingStatus; manufactureYear: number | null;
  intermediateDate: string | null; intermediateFreqMonths: number | null;
  intermediateDueDate: string | null;
  majorDate: string | null; majorFreqMonths: number | null;
  majorDueDate: string | null;
  remarks: string; specs: Record<string, string>;
  approveStatus: ApproveStatus; approverId: string | null; rejectReason: string | null;
  // joined labels from insp_records_expanded
  category: InspCategory; typeName: string; specFields: string[];
  partName: string | null; componentName: string | null;
  unitName: string; companyName: string | null;
}

export type FileKind =
  | 'oem_certificate' | 'user_manual' | 'spare_parts_manual' | 'drawing'
  | 'inspection_certificate' | 'major_inspection_certificate' | 'other';

export const FILE_KIND_LABELS: Record<FileKind, string> = {
  oem_certificate: 'OEM Certificate',
  user_manual: 'User Manual',
  spare_parts_manual: 'Spare Parts Manual',
  drawing: 'Drawing',
  inspection_certificate: 'Inspection Certificate',
  major_inspection_certificate: 'Major Inspection Certificate',
  other: 'Other',
};

/** Kinds that may carry an expiry date (certificates). */
export const CERTIFICATE_KINDS: FileKind[] =
  ['oem_certificate', 'inspection_certificate', 'major_inspection_certificate'];

export interface InspFile {
  id: string; recordId: string; kind: FileKind; storagePath: string;
  fileName: string; fileSize: number; expiryDate: string | null; createdAt: string;
}
```

- [ ] **Step 2: Write the failing permissions test** (`lib/permissions.test.ts`; mirror `src/modules/tubular/lib/permissions.test.ts` structure)

```ts
import { describe, expect, it } from 'vitest';
import { canAccessModule, hasPermission, isPrivileged, INSPECTION_PERMISSIONS } from './permissions';

describe('inspection permissions', () => {
  it('admin and manager are privileged; field and null are not', () => {
    expect(isPrivileged('admin')).toBe(true);
    expect(isPrivileged('manager')).toBe(true);
    expect(isPrivileged('field')).toBe(false);
    expect(isPrivileged(null)).toBe(false);
  });

  it('privileged roles hold every permission implicitly', () => {
    for (const p of INSPECTION_PERMISSIONS) {
      expect(hasPermission('admin', new Set(), p)).toBe(true);
    }
  });

  it('non-privileged users need an explicit grant', () => {
    expect(hasPermission('field', new Set(), 'insp_view')).toBe(false);
    expect(hasPermission('field', new Set(['insp_view']), 'insp_view')).toBe(true);
    expect(hasPermission('field', new Set(['insp_view']), 'insp_approve')).toBe(false);
  });

  it('module access requires insp_view (or privilege)', () => {
    expect(canAccessModule(null, new Set())).toBe(false);
    expect(canAccessModule('field', new Set(['insp_view']))).toBe(true);
    expect(canAccessModule('manager', new Set())).toBe(true);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/modules/inspection/lib/permissions.test.ts`
Expected: FAIL — cannot resolve `./permissions`.

- [ ] **Step 4: Write `lib/permissions.ts`**

```ts
// ============================================================================
//  Inspection module — pure permission helpers (mirror of has_insp_perm() in
//  0029). The DB (RLS + RPC guards) is the real authorization boundary; these
//  only drive navigation/UI, same pattern as the tubular module.
// ============================================================================
import type { Role } from '../../../state/AuthContext';

export const INSPECTION_PERMISSIONS = [
  'insp_view',
  'insp_data_entry',
  'insp_approve',
  'insp_upload',
  'insp_manage_catalog',
  'insp_manage_files',
  'insp_export',
] as const;

export type InspectionPermission = (typeof INSPECTION_PERMISSIONS)[number];

export function isPrivileged(role: Role | null): boolean {
  return role === 'admin' || role === 'manager';
}

export function hasPermission(
  role: Role | null,
  granted: ReadonlySet<string>,
  perm: InspectionPermission,
): boolean {
  return isPrivileged(role) || granted.has(perm);
}

export function canAccessModule(role: Role | null, granted: ReadonlySet<string>): boolean {
  return isPrivileged(role) || granted.has('insp_view');
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/modules/inspection/lib/permissions.test.ts`
Expected: PASS (4 tests). Also run `npm run typecheck`.

- [ ] **Step 6: Commit**

```bash
git add src/modules/inspection/types.ts src/modules/inspection/lib/permissions.ts src/modules/inspection/lib/permissions.test.ts
git commit -m "feat(inspection): shared types and pure permission helpers"
```

---

### Task 5: Compliance library — due dates, RAG status, alerts (TDD)

**Files:**
- Create: `src/modules/inspection/lib/compliance.ts`
- Test: `src/modules/inspection/lib/compliance.test.ts`

**Interfaces:**
- Consumes: `InspectionRecord`, `InspFile`, `FILE_KIND_LABELS` from `../types`.
- Produces: `ComplianceStatus` (`'overdue' | 'due_soon' | 'compliant' | 'unknown'`), `DUE_SOON_DAYS = 30`, `daysUntil(dueIso, todayIso): number | null`, `complianceStatus(dueIso, todayIso): ComplianceStatus`, `computeDueDate(dateIso, freqMonths): string | null` (mirrors the DB trigger incl. month-end clamping), `recordCompliance(rec, todayIso): ComplianceStatus`, `AlertItem`, `buildAlerts(records, files, todayIso): AlertItem[]`. Used by Tasks 8, 9, 10, 13, 15.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import {
  buildAlerts, complianceStatus, computeDueDate, daysUntil, recordCompliance,
} from './compliance';
import type { InspectionRecord, InspFile } from '../types';

const TODAY = '2026-08-12';

function rec(over: Partial<InspectionRecord>): InspectionRecord {
  return {
    id: 'r1', typeId: 't', partId: null, componentId: null, unitId: 'u', companyId: null,
    componentDescription: '', oem: '', inspectionCompany: '', serialNumber: 'SN-1',
    partNumber: '', workingStatus: 'in_use', manufactureYear: null,
    intermediateDate: null, intermediateFreqMonths: null, intermediateDueDate: null,
    majorDate: null, majorFreqMonths: null, majorDueDate: null,
    remarks: '', specs: {}, approveStatus: 'approved', approverId: null, rejectReason: null,
    category: 'well_control', typeName: 'Air pump', specFields: [],
    partName: null, componentName: null, unitName: 'Rig 103', companyName: null,
    ...over,
  };
}

describe('computeDueDate', () => {
  it('adds frequency months (mirrors DB trigger)', () => {
    expect(computeDueDate('2026-01-31', 12)).toBe('2027-01-31');
    expect(computeDueDate('2025-08-14', 12)).toBe('2026-08-14');
    expect(computeDueDate('2021-01-31', 60)).toBe('2026-01-31');
  });
  it('clamps to month end like Postgres make_interval', () => {
    expect(computeDueDate('2026-08-31', 6)).toBe('2027-02-28');
  });
  it('returns null when date or frequency missing', () => {
    expect(computeDueDate(null, 12)).toBeNull();
    expect(computeDueDate('2026-01-31', null)).toBeNull();
  });
});

describe('complianceStatus', () => {
  it('overdue when due date is in the past', () => {
    expect(complianceStatus('2026-08-11', TODAY)).toBe('overdue');
  });
  it('due_soon within 30 days inclusive', () => {
    expect(complianceStatus('2026-08-12', TODAY)).toBe('due_soon');
    expect(complianceStatus('2026-09-11', TODAY)).toBe('due_soon');
  });
  it('compliant beyond 30 days', () => {
    expect(complianceStatus('2026-09-12', TODAY)).toBe('compliant');
  });
  it('unknown when no due date', () => {
    expect(complianceStatus(null, TODAY)).toBe('unknown');
  });
});

describe('daysUntil', () => {
  it('negative when overdue, matches source system display', () => {
    expect(daysUntil('2026-08-10', TODAY)).toBe(-2);
    expect(daysUntil('2026-08-22', TODAY)).toBe(10);
    expect(daysUntil(null, TODAY)).toBeNull();
  });
});

describe('recordCompliance', () => {
  it('takes the worst of intermediate and major', () => {
    const r = rec({ intermediateDueDate: '2027-01-01', majorDueDate: '2026-01-01' });
    expect(recordCompliance(r, TODAY)).toBe('overdue');
  });
  it('unknown only when both dates missing', () => {
    expect(recordCompliance(rec({}), TODAY)).toBe('unknown');
    expect(recordCompliance(rec({ intermediateDueDate: '2027-01-01' }), TODAY)).toBe('compliant');
  });
});

describe('buildAlerts', () => {
  it('emits overdue + due_soon inspection alerts and expiring certificate alerts, overdue first', () => {
    const records = [
      rec({ id: 'a', serialNumber: 'SN-A', majorDueDate: '2026-08-01' }),          // overdue
      rec({ id: 'b', serialNumber: 'SN-B', intermediateDueDate: '2026-08-20' }),   // due soon
      rec({ id: 'c', serialNumber: 'SN-C', majorDueDate: '2027-08-01' }),          // compliant → none
    ];
    const files: InspFile[] = [{
      id: 'f1', recordId: 'a', kind: 'inspection_certificate',
      storagePath: 'records/a/inspection_certificate/cert.pdf', fileName: 'cert.pdf',
      fileSize: 1000, expiryDate: '2026-08-25', createdAt: '2026-01-01',
    }];
    const alerts = buildAlerts(records, files, TODAY);
    expect(alerts).toHaveLength(3);
    expect(alerts[0]).toMatchObject({ recordId: 'a', severity: 'overdue', kind: 'major' });
    expect(alerts.map((a) => a.kind)).toContain('certificate');
    expect(alerts.every((a) => a.daysUntil <= 30)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/modules/inspection/lib/compliance.test.ts`
Expected: FAIL — cannot resolve `./compliance`.

- [ ] **Step 3: Write `lib/compliance.ts`**

```ts
// ============================================================================
//  Inspection compliance — pure date math. RAG status is DERIVED, never stored
//  (enhancement over the source system, which shows status but lets it drift).
//  computeDueDate mirrors the 0030 DB trigger exactly (month-end clamping).
// ============================================================================
import type { InspFile, InspectionRecord } from '../types';
import { FILE_KIND_LABELS } from '../types';

export type ComplianceStatus = 'overdue' | 'due_soon' | 'compliant' | 'unknown';

export const DUE_SOON_DAYS = 30;

const MS_PER_DAY = 86_400_000;

function toUtc(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

export function daysUntil(dueIso: string | null | undefined, todayIso: string): number | null {
  if (!dueIso) return null;
  return Math.round((toUtc(dueIso) - toUtc(todayIso)) / MS_PER_DAY);
}

export function complianceStatus(dueIso: string | null | undefined, todayIso: string): ComplianceStatus {
  const days = daysUntil(dueIso, todayIso);
  if (days === null) return 'unknown';
  if (days < 0) return 'overdue';
  if (days <= DUE_SOON_DAYS) return 'due_soon';
  return 'compliant';
}

/** date + N months with Postgres-style month-end clamping; null-safe. */
export function computeDueDate(dateIso: string | null | undefined, freqMonths: number | null | undefined): string | null {
  if (!dateIso || !freqMonths) return null;
  const [y, m, d] = dateIso.split('-').map(Number);
  const targetMonth = m - 1 + freqMonths;
  const lastDay = new Date(Date.UTC(y, targetMonth + 1, 0)).getUTCDate();
  const due = new Date(Date.UTC(y, targetMonth, Math.min(d, lastDay)));
  return due.toISOString().slice(0, 10);
}

const SEVERITY_RANK: Record<ComplianceStatus, number> = {
  overdue: 0, due_soon: 1, compliant: 2, unknown: 3,
};

export function recordCompliance(
  rec: Pick<InspectionRecord, 'intermediateDueDate' | 'majorDueDate'>,
  todayIso: string,
): ComplianceStatus {
  const a = complianceStatus(rec.intermediateDueDate, todayIso);
  const b = complianceStatus(rec.majorDueDate, todayIso);
  if (a === 'unknown' && b === 'unknown') return 'unknown';
  const known = [a, b].filter((s) => s !== 'unknown');
  return known.sort((x, y) => SEVERITY_RANK[x] - SEVERITY_RANK[y])[0];
}

export interface AlertItem {
  id: string;
  recordId: string;
  severity: 'overdue' | 'due_soon';
  kind: 'intermediate' | 'major' | 'certificate';
  label: string;       // e.g. "SN-A — Major inspection" / "SN-A — Inspection Certificate expiry"
  dueDate: string;
  daysUntil: number;
}

/** Overdue + due-soon inspections and expiring certificates, worst first. */
export function buildAlerts(
  records: InspectionRecord[],
  files: InspFile[],
  todayIso: string,
): AlertItem[] {
  const alerts: AlertItem[] = [];
  const push = (recordId: string, kind: AlertItem['kind'], label: string, due: string) => {
    const status = complianceStatus(due, todayIso);
    if (status !== 'overdue' && status !== 'due_soon') return;
    alerts.push({
      id: `${recordId}:${kind}:${due}`, recordId, kind, label,
      severity: status, dueDate: due, daysUntil: daysUntil(due, todayIso) ?? 0,
    });
  };
  for (const r of records) {
    if (r.intermediateDueDate) push(r.id, 'intermediate', `${r.serialNumber || r.typeName} — Intermediate inspection`, r.intermediateDueDate);
    if (r.majorDueDate) push(r.id, 'major', `${r.serialNumber || r.typeName} — Major inspection`, r.majorDueDate);
  }
  const bySerial = new Map(records.map((r) => [r.id, r.serialNumber || r.typeName]));
  for (const f of files) {
    if (f.expiryDate) {
      push(f.recordId, 'certificate',
        `${bySerial.get(f.recordId) ?? f.fileName} — ${FILE_KIND_LABELS[f.kind]} expiry`, f.expiryDate);
    }
  }
  return alerts.sort((x, y) =>
    x.severity === y.severity ? x.daysUntil - y.daysUntil : x.severity === 'overdue' ? -1 : 1);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/modules/inspection/lib/compliance.test.ts`
Expected: PASS (all describe blocks).

- [ ] **Step 5: Commit**

```bash
git add src/modules/inspection/lib/compliance.ts src/modules/inspection/lib/compliance.test.ts
git commit -m "feat(inspection): compliance lib - due dates, RAG status, alert builder"
```

### Task 6: Data access layer — records service + pure filter helpers (TDD)

**Files:**
- Create: `src/modules/inspection/lib/filters.ts`
- Test: `src/modules/inspection/lib/filters.test.ts`
- Create: `src/modules/inspection/lib/records.ts`

**Interfaces:**
- Consumes: `supabase` (`SupabaseClient | null`) from `src/lib/supabase`; types from Task 4; RPC/view names from Task 2.
- Produces:
  - `filters.ts`: `applyColumnSearch(rows, search: Record<string, string>): InspectionRecord[]` (case-insensitive contains over mapped column keys), `filterByCompliance(rows, status: 'all' | 'overdue' | 'due_soon' | 'compliant', todayIso): InspectionRecord[]`, `paginate<T>(rows: T[], page: number, perPage: number): { pageRows: T[]; total: number; pages: number }`, `SEARCHABLE_COLUMNS` (key → accessor map).
  - `records.ts`: `mapRow(row: Record<string, unknown>): InspectionRecord`, `fetchCatalog()`, `fetchApprovers(): Promise<{ id: string; name: string }[]>`, `fetchRecords(opts: { category?; typeId?; unitId? }): Promise<InspectionRecord[]>`, `insertRecord(draft: RecordDraft): Promise<string>`, `updateRecord(id, patch): Promise<void>`, `bulkUpdateDates(ids, major, intermediate): Promise<number>`, `setApproval(ids, approve, reason?): Promise<number>`, `importRecords(rows: ImportRow[]): Promise<number>`, exported types `RecordDraft`, `ImportRow`.

Server-side narrowing is by category/type/unit only; column search, compliance filter and pagination are client-side (instant-search enhancement — the dataset per narrowed fetch is a few thousand rows at most).

- [ ] **Step 1: Write the failing filters test**

```ts
import { describe, expect, it } from 'vitest';
import { applyColumnSearch, filterByCompliance, paginate } from './filters';
import type { InspectionRecord } from '../types';

function rec(over: Partial<InspectionRecord>): InspectionRecord {
  return {
    id: Math.random().toString(36).slice(2), typeId: 't', partId: null, componentId: null,
    unitId: 'u', companyId: null, componentDescription: '', oem: 'SARA SAE',
    inspectionCompany: 'BUREAU VERITAS', serialNumber: 'A/81/2/1027', partNumber: 'N/A',
    workingStatus: 'in_use', manufactureYear: 2011,
    intermediateDate: '2025-08-14', intermediateFreqMonths: 12, intermediateDueDate: '2026-08-14',
    majorDate: '2021-01-31', majorFreqMonths: 60, majorDueDate: '2026-01-31',
    remarks: '', specs: {}, approveStatus: 'approved', approverId: null, rejectReason: null,
    category: 'well_control', typeName: 'Air pump', specFields: [],
    partName: 'Air pump 1', componentName: null, unitName: 'Rig 103', companyName: 'Abraj Oman',
    ...over,
  };
}

describe('applyColumnSearch', () => {
  const rows = [rec({ unitName: 'Rig 103' }), rec({ unitName: 'Rig 202', oem: 'Haulotte' })];
  it('matches case-insensitively per column, ANDing columns', () => {
    expect(applyColumnSearch(rows, { unit: 'rig 1' })).toHaveLength(1);
    expect(applyColumnSearch(rows, { unit: 'rig', oem: 'haul' })).toHaveLength(1);
    expect(applyColumnSearch(rows, {})).toHaveLength(2);
  });
});

describe('filterByCompliance', () => {
  const today = '2026-08-12';
  const rows = [
    rec({ majorDueDate: '2026-01-31', intermediateDueDate: null }),   // overdue
    rec({ majorDueDate: '2026-08-20', intermediateDueDate: null }),   // due soon
    rec({ majorDueDate: '2027-08-20', intermediateDueDate: null }),   // compliant
  ];
  it('buckets by worst-of record compliance', () => {
    expect(filterByCompliance(rows, 'overdue', today)).toHaveLength(1);
    expect(filterByCompliance(rows, 'due_soon', today)).toHaveLength(1);
    expect(filterByCompliance(rows, 'compliant', today)).toHaveLength(1);
    expect(filterByCompliance(rows, 'all', today)).toHaveLength(3);
  });
});

describe('paginate', () => {
  it('slices pages and reports totals', () => {
    const rows = Array.from({ length: 23 }, (_, i) => i);
    expect(paginate(rows, 1, 10).pageRows).toHaveLength(10);
    expect(paginate(rows, 3, 10).pageRows).toHaveLength(3);
    expect(paginate(rows, 3, 10).pages).toBe(3);
    expect(paginate(rows, 99, 10).pageRows).toHaveLength(0);
    expect(paginate(rows, 1, 10).total).toBe(23);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/modules/inspection/lib/filters.test.ts`
Expected: FAIL — cannot resolve `./filters`.

- [ ] **Step 3: Write `lib/filters.ts`**

```ts
// ============================================================================
//  Pure client-side filtering for the inspection tables: per-column contains
//  search (the source system's under-header search boxes), RAG compliance
//  bucket filter, and simple pagination.
// ============================================================================
import type { InspectionRecord } from '../types';
import { recordCompliance, type ComplianceStatus } from './compliance';

export const SEARCHABLE_COLUMNS: Record<string, (r: InspectionRecord) => string> = {
  company: (r) => r.companyName ?? '',
  unit: (r) => r.unitName,
  category: (r) => r.category,
  equipment: (r) => r.typeName,
  part: (r) => r.partName ?? '',
  component: (r) => r.componentName ?? '',
  description: (r) => r.componentDescription,
  oem: (r) => r.oem,
  status: (r) => r.workingStatus,
  serial: (r) => r.serialNumber,
  partNumber: (r) => r.partNumber,
  inspectionCompany: (r) => r.inspectionCompany,
  approveStatus: (r) => r.approveStatus,
};

export function applyColumnSearch(
  rows: InspectionRecord[],
  search: Record<string, string>,
): InspectionRecord[] {
  const active = Object.entries(search).filter(([, v]) => v.trim() !== '');
  if (active.length === 0) return rows;
  return rows.filter((r) =>
    active.every(([key, needle]) => {
      const get = SEARCHABLE_COLUMNS[key];
      return get ? get(r).toLowerCase().includes(needle.trim().toLowerCase()) : true;
    }));
}

export function filterByCompliance(
  rows: InspectionRecord[],
  status: ComplianceStatus | 'all',
  todayIso: string,
): InspectionRecord[] {
  if (status === 'all') return rows;
  return rows.filter((r) => recordCompliance(r, todayIso) === status);
}

export function paginate<T>(rows: T[], page: number, perPage: number) {
  const total = rows.length;
  const pages = Math.max(1, Math.ceil(total / perPage));
  const start = (page - 1) * perPage;
  return { pageRows: rows.slice(start, start + perPage), total, pages };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/modules/inspection/lib/filters.test.ts`
Expected: PASS.

- [ ] **Step 5: Write `lib/records.ts`** (thin Supabase adapter; snake→camel mapping kept in one exported pure function)

```ts
// ============================================================================
//  Inspection data access — catalog + records + RPCs. Reads go through RLS
//  (insp_records_expanded view); writes go through RLS-guarded inserts or the
//  SECURITY DEFINER RPCs from 0030. Cloud-only by design (like tubular).
// ============================================================================
import { supabase } from '../../../lib/supabase';
import type {
  Company, EquipmentPart, EquipmentType, InspCategory, InspUnit,
  InspectionRecord, PartComponent, WorkingStatus,
} from '../types';

function need() {
  if (!supabase) throw new Error('Cloud not configured (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).');
  return supabase;
}

export function mapRow(row: Record<string, unknown>): InspectionRecord {
  const s = (k: string) => (row[k] ?? '') as string;
  const n = (k: string) => (row[k] === null || row[k] === undefined ? null : Number(row[k]));
  return {
    id: s('id'), typeId: s('type_id'),
    partId: (row.part_id as string) ?? null, componentId: (row.component_id as string) ?? null,
    unitId: s('unit_id'), companyId: (row.company_id as string) ?? null,
    componentDescription: s('component_description'), oem: s('oem'),
    inspectionCompany: s('inspection_company'), serialNumber: s('serial_number'),
    partNumber: s('part_number'), workingStatus: s('working_status') as WorkingStatus,
    manufactureYear: n('manufacture_year'),
    intermediateDate: (row.intermediate_date as string) ?? null,
    intermediateFreqMonths: n('intermediate_freq_months'),
    intermediateDueDate: (row.intermediate_due_date as string) ?? null,
    majorDate: (row.major_date as string) ?? null,
    majorFreqMonths: n('major_freq_months'),
    majorDueDate: (row.major_due_date as string) ?? null,
    remarks: s('remarks'), specs: (row.specs as Record<string, string>) ?? {},
    approveStatus: s('approve_status') as InspectionRecord['approveStatus'],
    approverId: (row.approver_id as string) ?? null,
    rejectReason: (row.reject_reason as string) ?? null,
    category: s('category') as InspCategory, typeName: s('type_name'),
    specFields: (row.spec_fields as string[]) ?? [],
    partName: (row.part_name as string) ?? null,
    componentName: (row.component_name as string) ?? null,
    unitName: s('unit_name'), companyName: (row.company_name as string) ?? null,
  };
}

export async function fetchCatalog() {
  const sb = need();
  const [types, parts, components, units, companies] = await Promise.all([
    sb.from('insp_equipment_types').select('*').order('name'),
    sb.from('insp_equipment_parts').select('*').order('position'),
    sb.from('insp_part_components').select('*').order('position'),
    sb.from('units').select('id,name,unit_type').order('name'),
    sb.from('insp_companies').select('id,name').order('name'),
  ]);
  for (const r of [types, parts, components, units, companies]) {
    if (r.error) throw new Error(r.error.message);
  }
  return {
    types: (types.data ?? []).map((t): EquipmentType => ({
      id: t.id, category: t.category, name: t.name, description: t.description,
      specFields: (t.spec_fields as string[]) ?? [], active: t.active,
    })),
    parts: (parts.data ?? []).map((p): EquipmentPart => ({
      id: p.id, typeId: p.type_id, name: p.name, description: p.description, position: p.position,
    })),
    components: (components.data ?? []).map((c): PartComponent => ({
      id: c.id, partId: c.part_id, name: c.name, description: c.description, position: c.position,
    })),
    units: (units.data ?? []).map((u): InspUnit => ({ id: u.id, name: u.name, unitType: u.unit_type })),
    companies: (companies.data ?? []) as Company[],
  };
}

/** Approver choices = privileged profiles; display name falls back gracefully. */
export async function fetchApprovers(): Promise<{ id: string; name: string }[]> {
  const sb = need();
  const { data, error } = await sb.from('profiles').select('*').in('role', ['admin', 'manager']);
  if (error) throw new Error(error.message);
  type P = Record<string, unknown>;
  return (data ?? []).map((p: P) => ({
    id: String(p.id ?? p.user_id),
    name: String(p.full_name ?? p.display_name ?? p.name ?? p.email ?? p.id),
  })).sort((a, b) => a.name.localeCompare(b.name));
}

export async function fetchRecords(opts: {
  category?: InspCategory; typeId?: string; unitId?: string;
} = {}): Promise<InspectionRecord[]> {
  const sb = need();
  let q = sb.from('insp_records_expanded').select('*');
  if (opts.category) q = q.eq('category', opts.category);
  if (opts.typeId) q = q.eq('type_id', opts.typeId);
  if (opts.unitId) q = q.eq('unit_id', opts.unitId);
  const { data, error } = await q.order('created_at', { ascending: false }).limit(10000);
  if (error) throw new Error(error.message);
  return (data ?? []).map(mapRow);
}

export interface RecordDraft {
  type_id: string; part_id?: string | null; component_id?: string | null;
  unit_id: string; company_id?: string | null; component_description?: string;
  oem?: string; inspection_company?: string; serial_number?: string; part_number?: string;
  working_status?: WorkingStatus; manufacture_year?: number | null;
  intermediate_date?: string | null; intermediate_freq_months?: number | null;
  major_date?: string | null; major_freq_months?: number | null;
  remarks?: string; specs?: Record<string, string>; approver_id?: string | null;
}

export type ImportRow = RecordDraft;

export async function insertRecord(draft: RecordDraft): Promise<string> {
  const sb = need();
  const { data, error } = await sb.from('insp_records').insert(draft).select('id').single();
  if (error) throw new Error(error.message);
  return data.id;
}

export async function updateRecord(id: string, patch: Partial<RecordDraft>): Promise<void> {
  const sb = need();
  const { error } = await sb.from('insp_records').update(patch).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function bulkUpdateDates(ids: string[], major: string | null, intermediate: string | null): Promise<number> {
  const sb = need();
  const { data, error } = await sb.rpc('insp_bulk_update_dates',
    { p_ids: ids, p_major: major, p_intermediate: intermediate });
  if (error) throw new Error(error.message);
  return data as number;
}

export async function setApproval(ids: string[], approve: boolean, reason?: string): Promise<number> {
  const sb = need();
  const { data, error } = await sb.rpc('insp_set_approval',
    { p_ids: ids, p_approve: approve, p_reason: reason ?? null });
  if (error) throw new Error(error.message);
  return data as number;
}

export async function importRecords(rows: ImportRow[]): Promise<number> {
  const sb = need();
  const { data, error } = await sb.rpc('insp_import_records', { p_rows: rows });
  if (error) throw new Error(error.message);
  return data as number;
}
```

- [ ] **Step 6: Typecheck and run all module tests**

Run: `npm run typecheck && npx vitest run src/modules/inspection`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/modules/inspection/lib/filters.ts src/modules/inspection/lib/filters.test.ts src/modules/inspection/lib/records.ts
git commit -m "feat(inspection): filters lib (TDD) and Supabase records service"
```

---

### Task 7: Module scaffold — context, shell, routing, home card

**Files:**
- Create: `src/modules/inspection/state/InspectionContext.tsx`
- Create: `src/modules/inspection/components/shell/InspectionTopbar.tsx`
- Create: `src/modules/inspection/components/shell/InspectionTabNav.tsx`
- Create: `src/modules/inspection/components/NotificationsSlot.tsx`
- Create: `src/modules/inspection/inspection.css`
- Create: `src/modules/inspection/InspectionModule.tsx`
- Modify: `src/App.tsx` (lazy import near line 19–23; appbar-hiding block near lines 109–114; routes near lines 148–163)
- Modify: `src/views/HomeView.tsx` (module card grid + permission check, near lines 12, 51, 61, 84–92)

**Interfaces:**
- Consumes: `useAuth()` from `src/state/AuthContext`; `fetchCatalog`, `fetchApprovers` (Task 6); `canAccessModule`, `hasPermission`, `InspectionPermission` (Task 4); `isSupabaseConfigured`, `supabase` from `src/lib/supabase`.
- Produces: `useInspection()` returning `{ enabled, loading, canAccess, can(perm), types, parts, components, units, companies, approvers, refreshCatalog, error }`; exported `EmptyState` component from `InspectionModule.tsx`; route `/inspection/*` with child routes `index`, `records`, `catalog`, `metrics`, `library` (placeholders until Tasks 8–16 replace them).

- [ ] **Step 1: Write `state/InspectionContext.tsx`**

```tsx
// ============================================================================
//  Inspection module state — access gate + grants + catalog cache. Mirrors
//  TubularContext: loads the user's insp_* grants once, then the catalog.
// ============================================================================
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { isSupabaseConfigured, supabase } from '../../../lib/supabase';
import { useAuth } from '../../../state/AuthContext';
import { canAccessModule, hasPermission, type InspectionPermission } from '../lib/permissions';
import { fetchApprovers, fetchCatalog } from '../lib/records';
import type { Company, EquipmentPart, EquipmentType, InspUnit, PartComponent } from '../types';

interface InspectionState {
  enabled: boolean;
  loading: boolean;
  canAccess: boolean;
  can: (perm: InspectionPermission) => boolean;
  types: EquipmentType[];
  parts: EquipmentPart[];
  components: PartComponent[];
  units: InspUnit[];
  companies: Company[];
  approvers: { id: string; name: string }[];
  refreshCatalog: () => Promise<void>;
  error: string | null;
}

const Ctx = createContext<InspectionState | null>(null);

export function InspectionProvider({ children }: { children: ReactNode }) {
  const { role, session } = useAuth();
  const [granted, setGranted] = useState<ReadonlySet<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [types, setTypes] = useState<EquipmentType[]>([]);
  const [parts, setParts] = useState<EquipmentPart[]>([]);
  const [components, setComponents] = useState<PartComponent[]>([]);
  const [units, setUnits] = useState<InspUnit[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [approvers, setApprovers] = useState<{ id: string; name: string }[]>([]);

  const enabled = isSupabaseConfigured;
  const canAccess = canAccessModule(role, granted);

  const refreshCatalog = useCallback(async () => {
    const cat = await fetchCatalog();
    setTypes(cat.types); setParts(cat.parts); setComponents(cat.components);
    setUnits(cat.units); setCompanies(cat.companies);
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!enabled || !supabase || !session) { setLoading(false); return; }
      try {
        const { data, error: gErr } = await supabase
          .from('user_module_permissions').select('permission')
          .eq('user_id', session.user.id);
        if (gErr) throw new Error(gErr.message);
        if (!alive) return;
        const grants = new Set((data ?? []).map((r) => r.permission as string));
        setGranted(grants);
        if (canAccessModule(role, grants)) {
          await refreshCatalog();
          setApprovers(await fetchApprovers());
        }
      } catch (e) {
        if (alive) setError((e as Error).message);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [enabled, session, role, refreshCatalog]);

  const value = useMemo<InspectionState>(() => ({
    enabled, loading, canAccess,
    can: (perm) => hasPermission(role, granted, perm),
    types, parts, components, units, companies, approvers, refreshCatalog, error,
  }), [enabled, loading, canAccess, role, granted, types, parts, components, units, companies, approvers, refreshCatalog, error]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useInspection(): InspectionState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useInspection must be used inside InspectionProvider');
  return v;
}
```

- [ ] **Step 2: Write the shell components**

`components/shell/InspectionTopbar.tsx`:

```tsx
import { Link } from 'react-router-dom';
import { AccountChip } from '../../../../components/Auth';
import NotificationsSlot from '../NotificationsSlot';

export default function InspectionTopbar() {
  return (
    <header className="insp-topbar">
      <div className="insp-brand">
        <img src="/brand/abraj-mark.png" alt="Abraj" />
        <div>
          <h1>Equipment Master Pro</h1>
          <div className="insp-sub">Equipment Inspection · Abraj Energy Services</div>
        </div>
      </div>
      <div className="insp-topbar-spacer" />
      <NotificationsSlot />
      <Link to="/home" className="insp-home-link">⌂ Modules</Link>
      <AccountChip />
    </header>
  );
}
```

`components/NotificationsSlot.tsx` (compilation placeholder; Task 15 replaces its body with the real bell):

```tsx
export default function NotificationsSlot() {
  return null; // Task 15 swaps this for <NotificationsBell />
}
```

`components/shell/InspectionTabNav.tsx`:

```tsx
import { NavLink } from 'react-router-dom';

const TABS = [
  { to: '/inspection', label: 'Dashboard', end: true },
  { to: '/inspection/records', label: 'Equipment Inspection', end: false },
  { to: '/inspection/catalog', label: 'Equipment Components', end: false },
  { to: '/inspection/metrics', label: 'Inspection Metrics', end: false },
  { to: '/inspection/library', label: 'Library', end: false },
];

export default function InspectionTabNav() {
  return (
    <nav className="insp-tabnav">
      {TABS.map((t) => (
        <NavLink key={t.to} to={t.to} end={t.end}
          className={({ isActive }) => (isActive ? 'active' : '')}>
          {t.label}
        </NavLink>
      ))}
    </nav>
  );
}
```

- [ ] **Step 3: Write `inspection.css`** (uses global theme tokens — `var(--panel)`, `var(--ink)`, `var(--line2)`, `var(--dim)`, `var(--sunk)`, `var(--accent)`, `var(--green)` — so light/dark themes work automatically)

```css
/* Inspection module — own shell inside the shared theme system. */
.insp-app { display: flex; flex-direction: column; min-height: 100%; background: var(--sunk); color: var(--ink); }
.insp-topbar { display: flex; align-items: center; gap: 14px; padding: 10px 18px; background: var(--panel); border-bottom: 1px solid var(--line2); }
.insp-brand { display: flex; align-items: center; gap: 10px; }
.insp-brand img { height: 30px; }
.insp-brand h1 { font-size: 15px; margin: 0; }
.insp-sub { font-size: 11px; color: var(--dim); }
.insp-topbar-spacer { flex: 1; }
.insp-home-link { font-size: 12.5px; color: var(--ink); text-decoration: none; border: 1px solid var(--line2); padding: 6px 10px; border-radius: 7px; }
.insp-tabnav { display: flex; gap: 4px; padding: 0 18px; background: var(--panel); border-bottom: 2px solid var(--line2); overflow-x: auto; }
.insp-tabnav a { padding: 10px 14px; font-size: 13px; font-weight: 600; color: var(--dim); text-decoration: none; border-bottom: 2px solid transparent; margin-bottom: -2px; white-space: nowrap; }
.insp-tabnav a.active { color: var(--accent); border-bottom-color: var(--accent); }
.insp-main { padding: 18px; flex: 1; }
.insp-card { background: var(--panel); border: 1px solid var(--line2); border-radius: 10px; padding: 14px; }
.insp-toolbar { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-bottom: 12px; }
.insp-btn { border: 1px solid var(--line2); background: var(--panel); color: var(--ink); padding: 7px 11px; border-radius: 7px; font-size: 12px; font-weight: 600; cursor: pointer; }
.insp-btn.primary { background: var(--accent); border-color: var(--accent); color: #fff; }
.insp-btn:disabled { opacity: .45; cursor: not-allowed; }
.insp-table-wrap { overflow-x: auto; border: 1px solid var(--line2); border-radius: 8px; }
.insp-table { border-collapse: collapse; width: 100%; font-size: 12.5px; min-width: 1200px; }
.insp-table th, .insp-table td { border-bottom: 1px solid var(--line2); padding: 7px 9px; text-align: left; white-space: nowrap; }
.insp-table thead th { background: var(--sunk); position: sticky; top: 0; font-size: 11px; text-transform: uppercase; letter-spacing: .04em; }
.insp-table thead input { width: 110px; font-size: 11px; padding: 3px 5px; border: 1px solid var(--line2); border-radius: 5px; background: var(--panel); color: var(--ink); }
.insp-table tbody tr:nth-child(even) { background: color-mix(in srgb, var(--sunk) 45%, transparent); }
.insp-rag { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 11px; font-weight: 700; }
.insp-rag.overdue { background: color-mix(in srgb, #d33 20%, transparent); color: #d33; }
.insp-rag.due_soon { background: color-mix(in srgb, #d90 20%, transparent); color: #b70; }
.insp-rag.compliant { background: color-mix(in srgb, var(--green) 18%, transparent); color: var(--green); }
.insp-rag.unknown { background: var(--sunk); color: var(--dim); }
.insp-field { display: flex; flex-direction: column; gap: 4px; font-size: 12px; }
.insp-field label { font-size: 11px; font-weight: 700; color: var(--dim); text-transform: uppercase; }
.insp-field input, .insp-field select, .insp-field textarea { border: 1px solid var(--line2); border-radius: 6px; padding: 7px 9px; background: var(--panel); color: var(--ink); font-size: 12.5px; }
.insp-form-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 12px; }
.insp-subtabs { display: flex; gap: 2px; margin-bottom: 12px; border-bottom: 1px solid var(--line2); }
.insp-subtabs button { border: 0; background: none; padding: 8px 14px; font-size: 12.5px; font-weight: 600; color: var(--dim); cursor: pointer; border-bottom: 2px solid transparent; }
.insp-subtabs button.active { color: var(--accent); border-bottom-color: var(--accent); }
.insp-cat-tabs { display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 12px; }
.insp-cat-tabs button { border: 1px solid var(--line2); background: var(--panel); color: var(--ink); border-radius: 999px; padding: 6px 13px; font-size: 12px; font-weight: 600; cursor: pointer; }
.insp-cat-tabs button.active { background: var(--accent); border-color: var(--accent); color: #fff; }
.insp-tree { min-width: 210px; border-right: 1px solid var(--line2); padding-right: 10px; font-size: 12.5px; }
.insp-tree button { display: block; width: 100%; text-align: left; border: 0; background: none; color: var(--ink); padding: 5px 7px; border-radius: 6px; cursor: pointer; }
.insp-tree button.active { background: color-mix(in srgb, var(--accent) 14%, transparent); color: var(--accent); }
.insp-kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; margin-bottom: 16px; }
.insp-kpi { background: var(--panel); border: 1px solid var(--line2); border-radius: 10px; padding: 14px; }
.insp-kpi .num { font-size: 26px; font-weight: 800; }
.insp-kpi .lbl { font-size: 11px; color: var(--dim); text-transform: uppercase; letter-spacing: .05em; }
.insp-empty { text-align: center; color: var(--dim); padding: 48px 0; }
.insp-empty .ico { font-size: 34px; }
.insp-drawer { position: fixed; top: 0; right: 0; bottom: 0; width: min(440px, 92vw); background: var(--panel); border-left: 1px solid var(--line2); box-shadow: -6px 0 24px rgba(0,0,0,.18); z-index: 60; padding: 16px; overflow-y: auto; }
.insp-dropzone { border: 2px dashed var(--line2); border-radius: 10px; padding: 22px; text-align: center; color: var(--dim); }
.insp-dropzone.drag { border-color: var(--accent); color: var(--accent); }
.insp-bell { position: relative; border: 1px solid var(--line2); background: var(--panel); border-radius: 7px; padding: 6px 10px; cursor: pointer; font-size: 14px; }
.insp-bell .badge { position: absolute; top: -6px; right: -6px; background: #d33; color: #fff; font-size: 10px; font-weight: 800; border-radius: 999px; padding: 1px 5px; }
.insp-bell-panel { position: absolute; right: 0; top: 40px; width: 340px; max-height: 420px; overflow-y: auto; background: var(--panel); border: 1px solid var(--line2); border-radius: 10px; box-shadow: 0 10px 30px rgba(0,0,0,.2); z-index: 70; }
.insp-bell-panel .item { padding: 9px 12px; border-bottom: 1px solid var(--line2); font-size: 12px; }
```

- [ ] **Step 4: Write `InspectionModule.tsx`** (routes render EmptyState placeholders that later tasks replace with real views)

```tsx
// ============================================================================
//  Equipment Inspection module shell — lazy-loaded from App.tsx; hides the WCE
//  appbar (same pattern as /tubular). Access-gated by insp_view.
// ============================================================================
import { Route, Routes } from 'react-router-dom';
import './inspection.css';
import { InspectionProvider, useInspection } from './state/InspectionContext';
import InspectionTopbar from './components/shell/InspectionTopbar';
import InspectionTabNav from './components/shell/InspectionTabNav';

export function EmptyState({ ico, title, desc }: { ico: string; title: string; desc: string }) {
  return (
    <div className="insp-empty">
      <div className="ico">{ico}</div>
      <div style={{ fontWeight: 700, marginTop: 6 }}>{title}</div>
      <div style={{ fontSize: 12.5, marginTop: 4 }}>{desc}</div>
    </div>
  );
}

function AccessGate() {
  const { enabled, loading, canAccess, error } = useInspection();
  if (!enabled) {
    return <EmptyState ico="☁" title="Cloud Required"
      desc="Equipment Inspection is database-backed. Configure Supabase to use this module." />;
  }
  if (loading) return <EmptyState ico="◌" title="Loading" desc="Loading your access…" />;
  if (error) return <EmptyState ico="⚠" title="Error" desc={error} />;
  if (!canAccess) {
    return <EmptyState ico="⚿" title="No Access"
      desc="Your account has no Inspection module permission yet. Ask an administrator to grant insp_view." />;
  }
  return (
    <Routes>
      <Route index element={<EmptyState ico="▦" title="Dashboard" desc="Register lands in Task 8." />} />
      <Route path="records" element={<EmptyState ico="✓" title="Equipment Inspection" desc="Lands in Task 9." />} />
      <Route path="catalog" element={<EmptyState ico="⚙" title="Equipment Components" desc="Lands in Task 12." />} />
      <Route path="metrics" element={<EmptyState ico="📈" title="Inspection Metrics" desc="Lands in Task 13." />} />
      <Route path="library" element={<EmptyState ico="🗀" title="Library" desc="Lands in Task 16." />} />
      <Route path="*" element={<EmptyState ico="?" title="Not Found" desc="This Inspection page does not exist." />} />
    </Routes>
  );
}

export default function InspectionModule() {
  return (
    <InspectionProvider>
      <div className="insp-app">
        <InspectionTopbar />
        <InspectionTabNav />
        <main className="insp-main">
          <AccessGate />
        </main>
      </div>
    </InspectionProvider>
  );
}
```

- [ ] **Step 5: Wire into `src/App.tsx`** — three edits mirroring the tubular pattern exactly:

```tsx
// after the RigStringModule lazy import (line ~23):
const InspectionModule = lazy(() => import('./modules/inspection/InspectionModule'));

// in Shell(): extend the appbar-hiding logic (lines ~109-111):
const inInspection = pathname.startsWith('/inspection');
const inWce = !inTubular && !inRigString && !inInspection && pathname !== '/home';
// and change the topbar condition {!inTubular && ( … )} to {!inTubular && !inInspection && ( … )}

// in <Routes>, after the /rig-string route:
<Route
  path="/inspection/*"
  element={
    <Suspense fallback={<div className="placeholder">Loading Equipment Inspection…</div>}>
      <InspectionModule />
    </Suspense>
  }
/>
```

- [ ] **Step 6: Add the Home card in `src/views/HomeView.tsx`**

Duplicate the existing Tubular card block (lines ~84–92), keeping the exact prop names of the local card component, changing only these values:

```tsx
import { canAccessModule as canAccessInspection } from '../modules/inspection/lib/permissions';
// alongside tubularOk (line ~61):
const inspectionOk = canAccessInspection(role, granted);
// new card values:
//   to="/inspection"
//   title: "Equipment Inspection"
//   sub: "Equipment Master Pro: inspection register, approvals, metrics, certificates and library."
//   note: offline ? 'Requires cloud sign-in' : (!loaded ? 'Checking access…' : inspectionOk ? 'Module · Inspection' : 'No access — ask an administrator')
//   disabled: offline || (loaded && !inspectionOk)
```

- [ ] **Step 7: Verify by running the app**

Run: `npm run typecheck && npm run dev` — open http://localhost:5173/home: the new card appears; clicking it (as admin) shows the Inspection shell with tab nav and the Task-8 placeholder. `/tubular` and WCE views unaffected.

- [ ] **Step 8: Commit**

```bash
git add src/modules/inspection src/App.tsx src/views/HomeView.tsx
git commit -m "feat(inspection): module shell, context, routing and home card"
```

### Task 8: Register (Dashboard) view — folder tree, RAG filter, column search, export (TDD on CSV)

**Files:**
- Create: `src/modules/inspection/lib/exportCsv.ts`
- Test: `src/modules/inspection/lib/exportCsv.test.ts`
- Create: `src/modules/inspection/components/SpecsPopover.tsx`
- Create: `src/modules/inspection/views/RegisterView.tsx`
- Modify: `src/modules/inspection/InspectionModule.tsx` (replace the `index` placeholder route with `<RegisterView />`)

**Interfaces:**
- Consumes: `fetchRecords` (Task 6), `applyColumnSearch`, `filterByCompliance`, `paginate` (Task 6), `recordCompliance` + `ComplianceStatus` (Task 5), `useInspection` (Task 7), types/labels (Task 4).
- Produces: `recordsToCsv(rows: InspectionRecord[]): string`, `downloadCsv(csv: string, fileName: string): void`, default `SpecsPopover({ record })`, named export `RagChip({ status })` from RegisterView (reused by Task 9), default export `RegisterView`.

- [ ] **Step 1: Write the failing CSV test**

```ts
import { describe, expect, it } from 'vitest';
import { recordsToCsv } from './exportCsv';
import type { InspectionRecord } from '../types';

const base: InspectionRecord = {
  id: 'x', typeId: 't', partId: null, componentId: null, unitId: 'u', companyId: null,
  componentDescription: 'Air pump', oem: 'SARA, SAE', inspectionCompany: 'BV',
  serialNumber: 'A"1', partNumber: 'N/A', workingStatus: 'in_use', manufactureYear: 2011,
  intermediateDate: '2025-08-14', intermediateFreqMonths: 12, intermediateDueDate: '2026-08-14',
  majorDate: '2021-01-31', majorFreqMonths: 60, majorDueDate: '2026-01-31',
  remarks: '', specs: { 'Size (in)': '8.5' }, approveStatus: 'approved',
  approverId: null, rejectReason: null, category: 'well_control', typeName: 'Air pump',
  specFields: [], partName: 'Air pump 1', componentName: null,
  unitName: 'Rig 103', companyName: 'Abraj Oman',
};

describe('recordsToCsv', () => {
  it('emits a header and one line per record', () => {
    const csv = recordsToCsv([base]);
    const lines = csv.trim().split('\n');
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain('Serial Number');
    expect(lines[1]).toContain('Rig 103');
  });
  it('escapes commas and quotes RFC-4180 style', () => {
    const csv = recordsToCsv([base]);
    expect(csv).toContain('"SARA, SAE"');
    expect(csv).toContain('"A""1"');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/modules/inspection/lib/exportCsv.test.ts`
Expected: FAIL — cannot resolve `./exportCsv`.

- [ ] **Step 3: Write `lib/exportCsv.ts`**

```ts
// ============================================================================
//  CSV export of inspection records — column order matches the source
//  system's register export.
// ============================================================================
import type { InspectionRecord } from '../types';
import { APPROVE_STATUS_LABELS, CATEGORY_LABELS, WORKING_STATUS_LABELS, frequencyLabel } from '../types';

const COLUMNS: [string, (r: InspectionRecord) => string][] = [
  ['Company', (r) => r.companyName ?? ''],
  ['Unit', (r) => r.unitName],
  ['Equipment Category', (r) => CATEGORY_LABELS[r.category]],
  ['Equipment', (r) => r.typeName],
  ['Equipment Part', (r) => r.partName ?? ''],
  ['Equipment Part Component', (r) => r.componentName ?? ''],
  ['Description', (r) => r.componentDescription],
  ['OEM', (r) => r.oem],
  ['Serial Number', (r) => r.serialNumber],
  ['Part Number', (r) => r.partNumber],
  ['Working Status', (r) => WORKING_STATUS_LABELS[r.workingStatus]],
  ['Manufacture Year', (r) => r.manufactureYear?.toString() ?? ''],
  ['Intermediate Inspection Date', (r) => r.intermediateDate ?? ''],
  ['Intermediate Inspection Frequency', (r) => r.intermediateFreqMonths ? frequencyLabel(r.intermediateFreqMonths) : ''],
  ['Intermediate Inspection Due Date', (r) => r.intermediateDueDate ?? ''],
  ['Major Inspection Date', (r) => r.majorDate ?? ''],
  ['Major Inspection Frequency', (r) => r.majorFreqMonths ? frequencyLabel(r.majorFreqMonths) : ''],
  ['Major Inspection Due Date', (r) => r.majorDueDate ?? ''],
  ['Inspection Company', (r) => r.inspectionCompany],
  ['Approve Status', (r) => APPROVE_STATUS_LABELS[r.approveStatus]],
  ['Remarks', (r) => r.remarks],
  ['Specs', (r) => Object.entries(r.specs).map(([k, v]) => `${k}: ${v}`).join('; ')],
];

function esc(v: string): string {
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export function recordsToCsv(rows: InspectionRecord[]): string {
  const header = COLUMNS.map(([h]) => esc(h)).join(',');
  const lines = rows.map((r) => COLUMNS.map(([, get]) => esc(get(r))).join(','));
  return [header, ...lines].join('\n') + '\n';
}

export function downloadCsv(csv: string, fileName: string): void {
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = fileName; a.click();
  URL.revokeObjectURL(url);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/modules/inspection/lib/exportCsv.test.ts` — Expected: PASS.

- [ ] **Step 5: Write `components/SpecsPopover.tsx`**

```tsx
import { useState } from 'react';
import type { InspectionRecord } from '../types';

/** ⓘ button that reveals the record's spec key/values (source system's Specs column). */
export default function SpecsPopover({ record }: { record: InspectionRecord }) {
  const [open, setOpen] = useState(false);
  const entries = Object.entries(record.specs);
  if (entries.length === 0) return <span style={{ color: 'var(--dim)' }}>—</span>;
  return (
    <span style={{ position: 'relative' }}>
      <button className="insp-btn" style={{ padding: '2px 8px', borderRadius: 999 }}
        onClick={() => setOpen((v) => !v)} title="Equipment specification">ⓘ</button>
      {open && (
        <div style={{ position: 'absolute', zIndex: 50, right: 0, top: 24, minWidth: 220,
          background: 'var(--panel)', border: '1px solid var(--line2)', borderRadius: 8,
          padding: 10, boxShadow: '0 8px 22px rgba(0,0,0,.18)', textAlign: 'left' }}>
          {entries.map(([k, v]) => (
            <div key={k} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 12 }}>
              <span style={{ color: 'var(--dim)' }}>{k}</span><b>{v || '—'}</b>
            </div>
          ))}
        </div>
      )}
    </span>
  );
}
```

- [ ] **Step 6: Write `views/RegisterView.tsx`**

```tsx
// ============================================================================
//  Register (Dashboard) — the source system's landing table: folder tree
//  (Company → Unit), RAG inspection-status filter, per-column search,
//  pagination and CSV export. RAG is computed live (enhancement).
// ============================================================================
import { useEffect, useMemo, useState } from 'react';
import { useInspection } from '../state/InspectionContext';
import { fetchRecords } from '../lib/records';
import { applyColumnSearch, filterByCompliance, paginate } from '../lib/filters';
import { recordCompliance, type ComplianceStatus } from '../lib/compliance';
import { downloadCsv, recordsToCsv } from '../lib/exportCsv';
import { APPROVE_STATUS_LABELS, CATEGORY_LABELS, WORKING_STATUS_LABELS,
  type InspectionRecord } from '../types';
import SpecsPopover from '../components/SpecsPopover';
import { EmptyState } from '../InspectionModule';

export function RagChip({ status }: { status: ComplianceStatus }) {
  const label = { overdue: 'Overdue', due_soon: 'Due Soon', compliant: 'Compliant', unknown: '—' }[status];
  return <span className={`insp-rag ${status}`}>{label}</span>;
}

const PER_PAGE_OPTIONS = [10, 25, 50, 100, 250, 500];

const CORE_COLS: [string, string][] = [                    // [searchKey, header]
  ['company', 'Company'], ['unit', 'Unit'], ['category', 'Equipment Category'],
  ['equipment', 'Equipment'], ['part', 'Equipment Part'], ['component', 'Part Component'],
  ['description', 'Description'], ['oem', 'OEM'], ['serial', 'Serial Number'],
];
const ADV_COLS: [string, string][] = [
  ['partNumber', 'Part Number'], ['status', 'Working Status'],
  ['inspectionCompany', 'Inspection Company'], ['approveStatus', 'Approve Status'],
];

export default function RegisterView() {
  const { canAccess } = useInspection();
  const [rows, setRows] = useState<InspectionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [search, setSearch] = useState<Record<string, string>>({});
  const [rag, setRag] = useState<ComplianceStatus | 'all'>('all');
  const [advanced, setAdvanced] = useState(false);
  const [tree, setTree] = useState(false);
  const [treeSel, setTreeSel] = useState<{ company?: string; unit?: string }>({});
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(25);
  const today = new Date().toISOString().slice(0, 10);

  useEffect(() => {
    if (!canAccess) return;
    let alive = true;
    fetchRecords().then((r) => { if (alive) { setRows(r); setLoading(false); } })
      .catch((e) => { if (alive) { setErr((e as Error).message); setLoading(false); } });
    return () => { alive = false; };
  }, [canAccess]);

  const companies = useMemo(
    () => [...new Set(rows.map((r) => r.companyName ?? 'Unassigned'))].sort(), [rows]);
  const unitsOf = (co: string) =>
    [...new Set(rows.filter((r) => (r.companyName ?? 'Unassigned') === co).map((r) => r.unitName))].sort();

  const filtered = useMemo(() => {
    let out = rows;
    if (treeSel.company) out = out.filter((r) => (r.companyName ?? 'Unassigned') === treeSel.company);
    if (treeSel.unit) out = out.filter((r) => r.unitName === treeSel.unit);
    out = applyColumnSearch(out, search);
    return filterByCompliance(out, rag, today);
  }, [rows, treeSel, search, rag, today]);

  const { pageRows, total, pages } = paginate(filtered, page, perPage);
  const cols = advanced ? [...CORE_COLS, ...ADV_COLS] : CORE_COLS;

  if (loading) return <EmptyState ico="◌" title="Loading" desc="Loading register…" />;
  if (err) return <EmptyState ico="⚠" title="Error" desc={err} />;

  return (
    <div>
      <div className="insp-toolbar">
        <h2 style={{ margin: 0, fontSize: 18 }}>Dashboard</h2>
        <span style={{ color: 'var(--dim)', fontSize: 12 }}>
          Equipment inspection compliance across companies and units.
        </span>
        <div style={{ flex: 1 }} />
        <button className="insp-btn primary"
          onClick={() => downloadCsv(recordsToCsv(filtered), 'inspection-register.csv')}>
          ⭳ Export Data
        </button>
        <button className="insp-btn" onClick={() => setTree((v) => !v)}>🗀 Folder Structure</button>
        <button className="insp-btn" onClick={() => { setSearch({}); setTreeSel({}); setRag('all'); setPage(1); }}>
          ⊗ Clear Search
        </button>
        <button className="insp-btn" onClick={() => setAdvanced((v) => !v)}>🔍 Advanced Search</button>
      </div>

      <div className="insp-toolbar">
        <div className="insp-field">
          <label>Inspection Status</label>
          <select value={rag} onChange={(e) => { setRag(e.target.value as ComplianceStatus | 'all'); setPage(1); }}>
            <option value="all">All</option>
            <option value="overdue">Overdue (Red)</option>
            <option value="due_soon">Due Soon (Yellow)</option>
            <option value="compliant">Compliant (Green)</option>
          </select>
        </div>
        <div className="insp-field">
          <label>Entries per page</label>
          <select value={perPage} onChange={(e) => { setPerPage(Number(e.target.value)); setPage(1); }}>
            {PER_PAGE_OPTIONS.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>
        <span style={{ fontSize: 12, color: 'var(--dim)' }}>
          Showing {pageRows.length ? (page - 1) * perPage + 1 : 0}–{(page - 1) * perPage + pageRows.length} of {total}
        </span>
      </div>

      <div style={{ display: 'flex', gap: 12 }}>
        {tree && (
          <aside className="insp-tree">
            <button className={!treeSel.company ? 'active' : ''}
              onClick={() => { setTreeSel({}); setPage(1); }}>All companies</button>
            {companies.map((co) => (
              <div key={co}>
                <button className={treeSel.company === co && !treeSel.unit ? 'active' : ''}
                  onClick={() => { setTreeSel({ company: co }); setPage(1); }}>▸ {co}</button>
                {treeSel.company === co && unitsOf(co).map((u) => (
                  <button key={u} style={{ paddingLeft: 22 }}
                    className={treeSel.unit === u ? 'active' : ''}
                    onClick={() => { setTreeSel({ company: co, unit: u }); setPage(1); }}>{u}</button>
                ))}
              </div>
            ))}
          </aside>
        )}

        <div className="insp-table-wrap" style={{ flex: 1 }}>
          <table className="insp-table">
            <thead>
              <tr>
                {cols.map(([, h]) => <th key={h}>{h}</th>)}
                <th>Specs</th>
                {advanced && <><th>Interm. Date</th><th>Interm. Due</th><th>Major Date</th><th>Major Due</th></>}
                <th>Inspection Status</th>
              </tr>
              <tr>
                {cols.map(([key]) => (
                  <th key={key}>
                    <input placeholder="Search…" value={search[key] ?? ''}
                      onChange={(e) => { setSearch((s) => ({ ...s, [key]: e.target.value })); setPage(1); }} />
                  </th>
                ))}
                <th />{advanced && <><th /><th /><th /><th /></>}<th />
              </tr>
            </thead>
            <tbody>
              {pageRows.map((r) => (
                <tr key={r.id}>
                  <td>{r.companyName ?? '—'}</td>
                  <td>{r.unitName}</td>
                  <td>{CATEGORY_LABELS[r.category]}</td>
                  <td>{r.typeName}</td>
                  <td>{r.partName ?? ''}</td>
                  <td>{r.componentName ?? ''}</td>
                  <td>{r.componentDescription}</td>
                  <td>{r.oem}</td>
                  <td>{r.serialNumber}</td>
                  {advanced && <>
                    <td>{r.partNumber}</td>
                    <td>{WORKING_STATUS_LABELS[r.workingStatus]}</td>
                    <td>{r.inspectionCompany}</td>
                    <td>{APPROVE_STATUS_LABELS[r.approveStatus]}</td>
                  </>}
                  <td><SpecsPopover record={r} /></td>
                  {advanced && <>
                    <td>{r.intermediateDate ?? ''}</td><td>{r.intermediateDueDate ?? ''}</td>
                    <td>{r.majorDate ?? ''}</td><td>{r.majorDueDate ?? ''}</td>
                  </>}
                  <td><RagChip status={recordCompliance(r, today)} /></td>
                </tr>
              ))}
              {pageRows.length === 0 && (
                <tr><td colSpan={20} style={{ textAlign: 'center', color: 'var(--dim)' }}>No matching records</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="insp-toolbar" style={{ marginTop: 10 }}>
        <button className="insp-btn" disabled={page <= 1} onClick={() => setPage(1)}>First</button>
        <button className="insp-btn" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</button>
        <span style={{ fontSize: 12 }}>Page {page} / {pages}</span>
        <button className="insp-btn" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>Next</button>
        <button className="insp-btn" disabled={page >= pages} onClick={() => setPage(pages)}>Last</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 7: Replace the index placeholder in `InspectionModule.tsx`**

```tsx
import RegisterView from './views/RegisterView';
// …
<Route index element={<RegisterView />} />
```

- [ ] **Step 8: Verify**

Run: `npm run typecheck && npx vitest run src/modules/inspection && npm run dev` — `/inspection` shows the register (empty until data is imported/entered; seed one row via SQL if needed to see RAG chips, tree and filters working).

- [ ] **Step 9: Commit**

```bash
git add src/modules/inspection
git commit -m "feat(inspection): register view with folder tree, RAG filter, column search, CSV export"
```

### Task 9: Equipment Inspection view — category tabs, Data Display, bulk updates, approvals

**Files:**
- Create: `src/modules/inspection/views/RecordsView.tsx`
- Create: `src/modules/inspection/views/DataDisplayTab.tsx`
- Modify: `src/modules/inspection/InspectionModule.tsx` (replace the `records` placeholder route with `<RecordsView />`)

**Interfaces:**
- Consumes: `useInspection` (Task 7), `fetchRecords`, `bulkUpdateDates`, `setApproval` (Task 6), `applyColumnSearch`, `paginate` (Task 6), `RagChip` (Task 8), `recordsToCsv`, `downloadCsv` (Task 8), `SpecsPopover` (Task 8), labels/constants (Task 4), `recordCompliance` (Task 5).
- Produces: `RecordsView` (default export) owning category-tab + sub-tab state (`sub`, `setSub`); `DataDisplayTab({ category })` (default export). Task 10 plugs `DataEntryForm` into the entry sub-tab; Task 11 plugs `DataUploadView` into the upload sub-tab; Task 14 adds the FILES column into `DataDisplayTab`.

- [ ] **Step 1: Write `views/RecordsView.tsx`** (tab frame; Entry/Upload panels stay `EmptyState` placeholders until Tasks 10–11)

```tsx
// ============================================================================
//  Equipment Inspection — 7 category tabs (source system parity), each with
//  Data Display / Data Upload / Data Entry sub-tabs.
// ============================================================================
import { useState } from 'react';
import { CATEGORY_LABELS, CATEGORY_ORDER, type InspCategory } from '../types';
import { useInspection } from '../state/InspectionContext';
import { EmptyState } from '../InspectionModule';
import DataDisplayTab from './DataDisplayTab';

type SubTab = 'display' | 'upload' | 'entry';

export default function RecordsView() {
  const { can } = useInspection();
  const [category, setCategory] = useState<InspCategory>('well_control');
  const [sub, setSub] = useState<SubTab>('display');

  return (
    <div>
      <h2 style={{ marginTop: 0, fontSize: 18 }}>Equipment Inspection</h2>
      <div style={{ color: 'var(--dim)', fontSize: 12, marginBottom: 12 }}>
        Inspection records by equipment system.
      </div>

      <div className="insp-cat-tabs">
        {CATEGORY_ORDER.map((c) => (
          <button key={c} className={c === category ? 'active' : ''}
            onClick={() => setCategory(c)}>{CATEGORY_LABELS[c]}</button>
        ))}
      </div>

      <div className="insp-subtabs">
        <button className={sub === 'display' ? 'active' : ''} onClick={() => setSub('display')}>Data Display</button>
        {can('insp_upload') && (
          <button className={sub === 'upload' ? 'active' : ''} onClick={() => setSub('upload')}>Data Upload</button>
        )}
        {can('insp_data_entry') && (
          <button className={sub === 'entry' ? 'active' : ''} onClick={() => setSub('entry')}>Data Entry</button>
        )}
      </div>

      {sub === 'display' && <DataDisplayTab category={category} />}
      {sub === 'upload' && <EmptyState ico="⇪" title="Data Upload" desc="Lands in Task 11." />}
      {sub === 'entry' && <EmptyState ico="✎" title="Data Entry" desc="Lands in Task 10." />}
    </div>
  );
}
```

- [ ] **Step 2: Write `views/DataDisplayTab.tsx`**

```tsx
// ============================================================================
//  Data Display — records of one category: equipment dropdown + part chips,
//  row selection, bulk inspection-date update, approve/reject, exports.
// ============================================================================
import { useEffect, useMemo, useState } from 'react';
import { useInspection } from '../state/InspectionContext';
import { bulkUpdateDates, fetchRecords, setApproval } from '../lib/records';
import { applyColumnSearch, paginate } from '../lib/filters';
import { recordCompliance } from '../lib/compliance';
import { downloadCsv, recordsToCsv } from '../lib/exportCsv';
import { APPROVE_STATUS_LABELS, WORKING_STATUS_LABELS, frequencyLabel,
  type InspCategory, type InspectionRecord } from '../types';
import SpecsPopover from '../components/SpecsPopover';
import { RagChip } from './RegisterView';
import { EmptyState } from '../InspectionModule';

export default function DataDisplayTab({ category }: { category: InspCategory }) {
  const { can, types, parts } = useInspection();
  const [rows, setRows] = useState<InspectionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [typeId, setTypeId] = useState<string>('');
  const [partSel, setPartSel] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState<Record<string, string>>({});
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);
  const [bulkMajor, setBulkMajor] = useState('');
  const [bulkInter, setBulkInter] = useState('');
  const [busy, setBusy] = useState(false);
  const today = new Date().toISOString().slice(0, 10);

  const catTypes = useMemo(() => types.filter((t) => t.category === category), [types, category]);
  const typeParts = useMemo(() => parts.filter((p) => p.typeId === typeId), [parts, typeId]);

  const reload = () => {
    setLoading(true);
    fetchRecords({ category })
      .then((r) => { setRows(r); setLoading(false); })
      .catch((e) => { setErr((e as Error).message); setLoading(false); });
  };
  useEffect(() => { reload(); setTypeId(''); setPartSel(new Set()); setSelected(new Set()); setPage(1); },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [category]);

  const filtered = useMemo(() => {
    let out = rows;
    if (typeId) out = out.filter((r) => r.typeId === typeId);
    if (partSel.size) out = out.filter((r) => r.partId !== null && partSel.has(r.partId));
    return applyColumnSearch(out, search);
  }, [rows, typeId, partSel, search]);

  const { pageRows, total, pages } = paginate(filtered, page, perPage);
  const allChecked = pageRows.length > 0 && pageRows.every((r) => selected.has(r.id));

  const toggleAll = () => setSelected((s) => {
    const n = new Set(s);
    if (allChecked) pageRows.forEach((r) => n.delete(r.id));
    else pageRows.forEach((r) => n.add(r.id));
    return n;
  });

  const applyBulkDates = async () => {
    if (selected.size === 0) { alert('Select rows first.'); return; }
    if (!bulkMajor && !bulkInter) { alert('Pick a major and/or intermediate date.'); return; }
    setBusy(true);
    try {
      const n = await bulkUpdateDates([...selected], bulkMajor || null, bulkInter || null);
      alert(`Updated ${n} record(s).`);
      setSelected(new Set()); reload();
    } catch (e) { alert((e as Error).message); }
    finally { setBusy(false); }
  };

  const doApproval = async (approve: boolean) => {
    if (selected.size === 0) { alert('Select rows first.'); return; }
    const reason = approve ? undefined : (prompt('Reject reason (optional)') ?? undefined);
    setBusy(true);
    try {
      const n = await setApproval([...selected], approve, reason);
      alert(`${approve ? 'Approved' : 'Rejected'} ${n} record(s).`);
      setSelected(new Set()); reload();
    } catch (e) { alert((e as Error).message); }
    finally { setBusy(false); }
  };

  if (loading) return <EmptyState ico="◌" title="Loading" desc="Loading records…" />;
  if (err) return <EmptyState ico="⚠" title="Error" desc={err} />;

  return (
    <div>
      <div className="insp-toolbar">
        <button className="insp-btn primary"
          onClick={() => downloadCsv(recordsToCsv(filtered), 'inspection-data.csv')}>⭳ Export Data</button>
        <button className="insp-btn" disabled={selected.size === 0}
          onClick={() => downloadCsv(recordsToCsv(filtered.filter((r) => selected.has(r.id))), 'inspection-selected.csv')}>
          ⭳ Export Selected ({selected.size})
        </button>
        {can('insp_approve') && (<>
          <button className="insp-btn" disabled={busy || selected.size === 0} onClick={() => doApproval(true)}>✓ Approve</button>
          <button className="insp-btn" disabled={busy || selected.size === 0} onClick={() => doApproval(false)}>✗ Reject</button>
        </>)}
      </div>

      <div className="insp-toolbar insp-card">
        <div className="insp-field">
          <label>Equipment</label>
          <select value={typeId} onChange={(e) => { setTypeId(e.target.value); setPartSel(new Set()); setPage(1); }}>
            <option value="">All equipment</option>
            {catTypes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
        <div className="insp-field" style={{ flex: 1 }}>
          <label>Equipment Part</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {typeParts.length === 0 && <span style={{ color: 'var(--dim)', fontSize: 12 }}>Select an equipment type</span>}
            {typeParts.map((p) => (
              <button key={p.id} className="insp-btn"
                style={partSel.has(p.id) ? { background: 'var(--accent)', color: '#fff', borderColor: 'var(--accent)' } : {}}
                onClick={() => { setPartSel((s) => { const n = new Set(s); if (n.has(p.id)) n.delete(p.id); else n.add(p.id); return n; }); setPage(1); }}>
                {p.name}
              </button>
            ))}
          </div>
        </div>
      </div>

      {can('insp_data_entry') && (
        <div className="insp-toolbar insp-card">
          <b style={{ fontSize: 12.5 }}>Bulk Update Inspection Dates</b>
          <span style={{ color: 'var(--dim)', fontSize: 11.5 }}>Select rows, then apply dates to all of them.</span>
          <div className="insp-field"><label>Major Inspection Date</label>
            <input type="date" value={bulkMajor} onChange={(e) => setBulkMajor(e.target.value)} /></div>
          <div className="insp-field"><label>Intermediate Inspection Date</label>
            <input type="date" value={bulkInter} onChange={(e) => setBulkInter(e.target.value)} /></div>
          <button className="insp-btn primary" disabled={busy} onClick={applyBulkDates}>🗓 Update Dates</button>
        </div>
      )}

      <div className="insp-table-wrap">
        <table className="insp-table">
          <thead>
            <tr>
              <th><input type="checkbox" checked={allChecked} onChange={toggleAll} /></th>
              <th>Unit</th><th>Equipment</th><th>Part</th><th>Component</th><th>OEM</th>
              <th>Working Status</th><th>Serial Number</th><th>Part Number</th>
              <th>Inspection Company</th>
              <th>Interm. Date</th><th>Interm. Due</th><th>Interm. Freq</th>
              <th>Major Date</th><th>Major Due</th><th>Major Freq</th>
              <th>Year</th><th>Remarks</th><th>Specs</th><th>Approve Status</th><th>RAG</th>
            </tr>
            <tr>
              <th />
              {(['unit','equipment','part','component','oem','status','serial','partNumber','inspectionCompany'] as const).map((k) => (
                <th key={k}><input placeholder="Search…" value={search[k] ?? ''}
                  onChange={(e) => { setSearch((s) => ({ ...s, [k]: e.target.value })); setPage(1); }} /></th>
              ))}
              <th /><th /><th /><th /><th /><th /><th /><th /><th />
              <th><input placeholder="Search…" value={search.approveStatus ?? ''}
                onChange={(e) => { setSearch((s) => ({ ...s, approveStatus: e.target.value })); setPage(1); }} /></th>
              <th />
            </tr>
          </thead>
          <tbody>
            {pageRows.map((r) => (
              <tr key={r.id}>
                <td><input type="checkbox" checked={selected.has(r.id)}
                  onChange={() => setSelected((s) => { const n = new Set(s); if (n.has(r.id)) n.delete(r.id); else n.add(r.id); return n; })} /></td>
                <td>{r.unitName}</td><td>{r.typeName}</td><td>{r.partName ?? ''}</td>
                <td>{r.componentName ?? ''}</td><td>{r.oem}</td>
                <td>{WORKING_STATUS_LABELS[r.workingStatus]}</td>
                <td>{r.serialNumber}</td><td>{r.partNumber}</td><td>{r.inspectionCompany}</td>
                <td>{r.intermediateDate ?? ''}</td><td>{r.intermediateDueDate ?? ''}</td>
                <td>{r.intermediateFreqMonths ? frequencyLabel(r.intermediateFreqMonths) : ''}</td>
                <td>{r.majorDate ?? ''}</td><td>{r.majorDueDate ?? ''}</td>
                <td>{r.majorFreqMonths ? frequencyLabel(r.majorFreqMonths) : ''}</td>
                <td>{r.manufactureYear ?? ''}</td><td>{r.remarks}</td>
                <td><SpecsPopover record={r} /></td>
                <td>{APPROVE_STATUS_LABELS[r.approveStatus]}</td>
                <td><RagChip status={recordCompliance(r, today)} /></td>
              </tr>
            ))}
            {pageRows.length === 0 && (
              <tr><td colSpan={21} style={{ textAlign: 'center', color: 'var(--dim)' }}>No records for this filter</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="insp-toolbar" style={{ marginTop: 10 }}>
        <button className="insp-btn" disabled={page <= 1} onClick={() => setPage(1)}>First</button>
        <button className="insp-btn" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</button>
        <span style={{ fontSize: 12 }}>Page {page} / {pages} · {total} entries</span>
        <button className="insp-btn" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>Next</button>
        <button className="insp-btn" disabled={page >= pages} onClick={() => setPage(pages)}>Last</button>
        <select value={perPage} onChange={(e) => { setPerPage(Number(e.target.value)); setPage(1); }}>
          {[10, 25, 50, 100, 250, 500].map((n) => <option key={n} value={n}>{n} / page</option>)}
        </select>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Replace the records placeholder in `InspectionModule.tsx`**

```tsx
import RecordsView from './views/RecordsView';
// …
<Route path="records" element={<RecordsView />} />
```

- [ ] **Step 4: Verify**

Run: `npm run typecheck && npx vitest run src/modules/inspection`. Then `npm run dev`: `/inspection/records` shows the 7 category pills, Data Display table, part chips after picking an equipment type, working bulk-date + approve/reject actions (verify against seeded scratch rows).

- [ ] **Step 5: Commit**

```bash
git add src/modules/inspection
git commit -m "feat(inspection): records view - category tabs, data display, bulk dates, approvals"
```

---

### Task 10: Data Entry form (single record with dynamic spec fields)

**Files:**
- Create: `src/modules/inspection/views/DataEntryForm.tsx`
- Modify: `src/modules/inspection/views/RecordsView.tsx` (replace the entry `EmptyState` with `<DataEntryForm category={category} onSaved={() => setSub('display')} />`)

**Interfaces:**
- Consumes: `useInspection` (types, parts, components, units, companies, approvers), `insertRecord`, `RecordDraft` (Task 6), `computeDueDate` (Task 5), constants (Task 4).
- Produces: `DataEntryForm({ category, onSaved }: { category: InspCategory; onSaved: () => void })` default export.

- [ ] **Step 1: Write `views/DataEntryForm.tsx`**

```tsx
// ============================================================================
//  Data Entry — source-parity single-record form: approver, catalog cascade
//  (equipment → part → component), unit/company, statuses, dates+frequencies
//  with live due-date preview (enhancement), and per-type spec fields.
// ============================================================================
import { useMemo, useState } from 'react';
import { useInspection } from '../state/InspectionContext';
import { insertRecord, type RecordDraft } from '../lib/records';
import { computeDueDate } from '../lib/compliance';
import { INTERMEDIATE_FREQUENCIES, MAJOR_FREQUENCIES, WORKING_STATUS_LABELS,
  frequencyLabel, type InspCategory, type WorkingStatus } from '../types';

export default function DataEntryForm({ category, onSaved }: {
  category: InspCategory; onSaved: () => void;
}) {
  const { types, parts, components, units, companies, approvers } = useInspection();
  const catTypes = useMemo(() => types.filter((t) => t.category === category), [types, category]);

  const [f, setF] = useState({
    approverId: '', typeId: '', partId: '', componentId: '', componentDescription: '',
    unitId: '', companyId: '', oem: '', inspectionCompany: '', serialNumber: '',
    partNumber: '', workingStatus: 'in_use' as WorkingStatus, manufactureYear: '',
    intermediateDate: '', intermediateFreq: '', majorDate: '', majorFreq: '', remarks: '',
  });
  const [specs, setSpecs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) =>
    setF((s) => ({ ...s, [k]: e.target.value }));

  const type = catTypes.find((t) => t.id === f.typeId);
  const typeParts = parts.filter((p) => p.typeId === f.typeId);
  const partComponents = components.filter((c) => c.partId === f.partId);
  const interDue = computeDueDate(f.intermediateDate || null, f.intermediateFreq ? Number(f.intermediateFreq) : null);
  const majorDue = computeDueDate(f.majorDate || null, f.majorFreq ? Number(f.majorFreq) : null);

  const save = async () => {
    if (!f.approverId) { alert('Approve User is required.'); return; }
    if (!f.typeId || !f.unitId) { alert('Equipment and Unit are required.'); return; }
    const draft: RecordDraft = {
      type_id: f.typeId, part_id: f.partId || null, component_id: f.componentId || null,
      unit_id: f.unitId, company_id: f.companyId || null,
      component_description: f.componentDescription, oem: f.oem,
      inspection_company: f.inspectionCompany, serial_number: f.serialNumber,
      part_number: f.partNumber, working_status: f.workingStatus,
      manufacture_year: f.manufactureYear ? Number(f.manufactureYear) : null,
      intermediate_date: f.intermediateDate || null,
      intermediate_freq_months: f.intermediateFreq ? Number(f.intermediateFreq) : null,
      major_date: f.majorDate || null,
      major_freq_months: f.majorFreq ? Number(f.majorFreq) : null,
      remarks: f.remarks, specs, approver_id: f.approverId,
    };
    setBusy(true);
    try {
      await insertRecord(draft);
      alert('Record saved (Pending Approval).');
      onSaved();
    } catch (e) { alert((e as Error).message); }
    finally { setBusy(false); }
  };

  return (
    <div className="insp-card">
      <h3 style={{ marginTop: 0 }}>New Inspection Record</h3>
      <div style={{ color: 'var(--dim)', fontSize: 12, marginBottom: 12 }}>
        Fill in the fields below and choose an approver, then save.
      </div>
      <div className="insp-form-grid">
        <div className="insp-field"><label>Approve User *</label>
          <select value={f.approverId} onChange={set('approverId')}>
            <option value="">Select approver…</option>
            {approvers.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select></div>
        <div className="insp-field"><label>Equipment *</label>
          <select value={f.typeId} onChange={(e) => { set('typeId')(e); setF((s) => ({ ...s, partId: '', componentId: '' })); setSpecs({}); }}>
            <option value="">Select equipment…</option>
            {catTypes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select></div>
        <div className="insp-field"><label>Equipment Part</label>
          <select value={f.partId} onChange={(e) => { set('partId')(e); setF((s) => ({ ...s, componentId: '' })); }}>
            <option value="">—</option>
            {typeParts.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select></div>
        <div className="insp-field"><label>Equipment Part Component</label>
          <select value={f.componentId} onChange={set('componentId')}>
            <option value="">—</option>
            {partComponents.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select></div>
        <div className="insp-field"><label>Component Description</label>
          <input value={f.componentDescription} onChange={set('componentDescription')} /></div>
        <div className="insp-field"><label>Unit *</label>
          <select value={f.unitId} onChange={set('unitId')}>
            <option value="">Select unit…</option>
            {units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select></div>
        <div className="insp-field"><label>Company</label>
          <select value={f.companyId} onChange={set('companyId')}>
            <option value="">—</option>
            {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select></div>
        <div className="insp-field"><label>OEM</label><input value={f.oem} onChange={set('oem')} /></div>
        <div className="insp-field"><label>Inspection Company</label>
          <input value={f.inspectionCompany} onChange={set('inspectionCompany')} /></div>
        <div className="insp-field"><label>Serial Number</label>
          <input value={f.serialNumber} onChange={set('serialNumber')} /></div>
        <div className="insp-field"><label>Part Number</label>
          <input value={f.partNumber} onChange={set('partNumber')} /></div>
        <div className="insp-field"><label>Status</label>
          <select value={f.workingStatus} onChange={set('workingStatus')}>
            {Object.entries(WORKING_STATUS_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select></div>
        <div className="insp-field"><label>Manufacture Year</label>
          <input type="number" min={1950} max={2100} value={f.manufactureYear} onChange={set('manufactureYear')} /></div>
        <div className="insp-field"><label>Intermediate Inspection Date</label>
          <input type="date" value={f.intermediateDate} onChange={set('intermediateDate')} /></div>
        <div className="insp-field"><label>Intermediate Frequency</label>
          <select value={f.intermediateFreq} onChange={set('intermediateFreq')}>
            <option value="">—</option>
            {INTERMEDIATE_FREQUENCIES.map((m) => <option key={m} value={m}>{frequencyLabel(m)}</option>)}
          </select>
          {interDue && <span style={{ fontSize: 11, color: 'var(--dim)' }}>Due: {interDue}</span>}</div>
        <div className="insp-field"><label>Major Inspection Date</label>
          <input type="date" value={f.majorDate} onChange={set('majorDate')} /></div>
        <div className="insp-field"><label>Major Frequency</label>
          <select value={f.majorFreq} onChange={set('majorFreq')}>
            <option value="">—</option>
            {MAJOR_FREQUENCIES.map((m) => <option key={m} value={m}>{frequencyLabel(m)}</option>)}
          </select>
          {majorDue && <span style={{ fontSize: 11, color: 'var(--dim)' }}>Due: {majorDue}</span>}</div>
        {(type?.specFields ?? []).map((field) => (
          <div className="insp-field" key={field}><label>{field}</label>
            <input value={specs[field] ?? ''} onChange={(e) => setSpecs((s) => ({ ...s, [field]: e.target.value }))} /></div>
        ))}
        <div className="insp-field" style={{ gridColumn: '1 / -1' }}><label>Remarks</label>
          <textarea rows={2} value={f.remarks} onChange={set('remarks')} /></div>
      </div>
      <div className="insp-toolbar" style={{ marginTop: 14 }}>
        <button className="insp-btn primary" disabled={busy} onClick={save}>💾 Save Record</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Wire into `RecordsView.tsx`**

```tsx
import DataEntryForm from './DataEntryForm';
// replace the entry placeholder:
{sub === 'entry' && <DataEntryForm category={category} onSaved={() => setSub('display')} />}
```

- [ ] **Step 3: Verify**

Run: `npm run typecheck && npm run dev` — enter a record for Well Control / Air pump / Rig 103 with an intermediate date + 1 Year: the live "Due:" preview matches what lands in Data Display after save (client/server due-date agreement); record appears as Pending Approval.

- [ ] **Step 4: Commit**

```bash
git add src/modules/inspection
git commit -m "feat(inspection): data entry form with catalog cascade and due-date preview"
```

### Task 11: Data Upload — Excel template + workbook import (TDD) + upload view

**Files:**
- Create: `src/modules/inspection/lib/template.ts`
- Create: `src/modules/inspection/lib/workbookImport.ts`
- Test: `src/modules/inspection/lib/workbookImport.test.ts`
- Create: `src/modules/inspection/views/DataUploadView.tsx`
- Modify: `src/modules/inspection/views/RecordsView.tsx` (replace upload placeholder with `<DataUploadView category={category} onDone={() => setSub('display')} />`)

**Interfaces:**
- Consumes: `xlsx` (SheetJS, already a dependency), catalog types (Task 4), `importRecords`, `ImportRow` (Task 6), `useInspection` (Task 7).
- Produces:
  - `template.ts`: `TEMPLATE_HEADERS: string[]`, `TemplateContext = { types; units; companies }`, `buildTemplateWorkbook(category: InspCategory, ctx: TemplateContext): XLSX.WorkBook`.
  - `workbookImport.ts`: `ImportContext = { category; types; parts; components; units; companies }`, `parseWorkbook(wb: XLSX.WorkBook, ctx: ImportContext): { rows: ImportRow[]; errors: string[] }` (row-numbered errors; name→id resolution; label parsing; ISO date validation).

Template rows use display names; import resolves them to ids. Spec fields are entered per-record later (Data Entry), matching the source template's core columns.

- [ ] **Step 1: Write `lib/template.ts`** (needed by the test)

```ts
// ============================================================================
//  Upload template — one Data sheet with header row + a Lists sheet of valid
//  values (equipment names, units, companies, statuses, frequencies).
// ============================================================================
import * as XLSX from 'xlsx';
import type { Company, EquipmentType, InspCategory, InspUnit } from '../types';
import { CATEGORY_LABELS, INTERMEDIATE_FREQUENCIES, MAJOR_FREQUENCIES,
  WORKING_STATUS_LABELS, frequencyLabel } from '../types';

export const TEMPLATE_HEADERS = [
  'Equipment', 'Equipment Part', 'Equipment Part Component', 'Component Description',
  'Unit', 'Company', 'OEM', 'Inspection Company', 'Serial Number', 'Part Number',
  'Status', 'Manufacture Year',
  'Intermediate Inspection Date (YYYY-MM-DD)', 'Intermediate Inspection Frequency',
  'Major Inspection Date (YYYY-MM-DD)', 'Major Inspection Frequency', 'Remarks',
];

export interface TemplateContext {
  types: EquipmentType[]; units: InspUnit[]; companies: Company[];
}

export function buildTemplateWorkbook(category: InspCategory, ctx: TemplateContext): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();
  const data = XLSX.utils.aoa_to_sheet([TEMPLATE_HEADERS]);
  XLSX.utils.book_append_sheet(wb, data, 'Data');
  const lists = XLSX.utils.aoa_to_sheet([
    [`Valid values — ${CATEGORY_LABELS[category]}`],
    ['Equipment:', ...ctx.types.filter((t) => t.category === category).map((t) => t.name)],
    ['Unit:', ...ctx.units.map((u) => u.name)],
    ['Company:', ...ctx.companies.map((c) => c.name)],
    ['Status:', ...Object.values(WORKING_STATUS_LABELS)],
    ['Intermediate Frequency:', ...INTERMEDIATE_FREQUENCIES.map(frequencyLabel)],
    ['Major Frequency:', ...MAJOR_FREQUENCIES.map(frequencyLabel)],
  ]);
  XLSX.utils.book_append_sheet(wb, lists, 'Lists');
  return wb;
}
```

- [ ] **Step 2: Write the failing import test**

```ts
import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { parseWorkbook, type ImportContext } from './workbookImport';
import { TEMPLATE_HEADERS } from './template';

const ctx: ImportContext = {
  category: 'well_control',
  types: [{ id: 'T1', category: 'well_control', name: 'Air pump', description: '', specFields: [], active: true }],
  parts: [{ id: 'P1', typeId: 'T1', name: 'Air pump 1', description: '', position: 1 }],
  components: [],
  units: [{ id: 'U1', name: 'Rig 103', unitType: 'rig' }],
  companies: [{ id: 'C1', name: 'Abraj Oman' }],
};

function wbOf(rows: (string | number)[][]): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([TEMPLATE_HEADERS, ...rows]), 'Data');
  return wb;
}

describe('parseWorkbook', () => {
  it('resolves names to ids and parses labels', () => {
    const { rows, errors } = parseWorkbook(wbOf([[
      'Air pump', 'Air pump 1', '', 'Air pump', 'Rig 103', 'Abraj Oman', 'SARA SAE',
      'BUREAU VERITAS', 'AP-1', 'N/A', 'In Use', 2011,
      '2025-08-14', '1 Year', '2021-01-31', '5 Year', 'ok',
    ]]), ctx);
    expect(errors).toHaveLength(0);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      type_id: 'T1', part_id: 'P1', unit_id: 'U1', company_id: 'C1',
      working_status: 'in_use', manufacture_year: 2011,
      intermediate_date: '2025-08-14', intermediate_freq_months: 12,
      major_date: '2021-01-31', major_freq_months: 60,
    });
  });
  it('reports row-numbered errors for unknown names and bad dates', () => {
    const { rows, errors } = parseWorkbook(wbOf([
      ['Nope', '', '', '', 'Rig 103', '', '', '', '', '', 'In Use', '', '', '', '', '', ''],
      ['Air pump', '', '', '', 'Rig 999', '', '', '', '', '', 'In Use', '', '14/08/2025', '1 Year', '', '', ''],
    ]), ctx);
    expect(rows).toHaveLength(0);
    expect(errors.some((e) => e.includes('Row 2') && e.includes('Nope'))).toBe(true);
    expect(errors.some((e) => e.includes('Row 3') && e.includes('Rig 999'))).toBe(true);
    expect(errors.some((e) => e.includes('Row 3') && e.includes('date'))).toBe(true);
  });
  it('skips fully empty rows', () => {
    const { rows, errors } = parseWorkbook(wbOf([['', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '']]), ctx);
    expect(rows).toHaveLength(0);
    expect(errors).toHaveLength(0);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/modules/inspection/lib/workbookImport.test.ts`
Expected: FAIL — cannot resolve `./workbookImport`.

- [ ] **Step 4: Write `lib/workbookImport.ts`**

```ts
// ============================================================================
//  Parse an upload workbook (template.ts layout) into ImportRow[] with
//  human-readable, row-numbered validation errors. Pure — testable offline.
// ============================================================================
import * as XLSX from 'xlsx';
import type { ImportRow } from './records';
import type { Company, EquipmentPart, EquipmentType, InspCategory, InspUnit, PartComponent, WorkingStatus } from '../types';
import { INTERMEDIATE_FREQUENCIES, MAJOR_FREQUENCIES, WORKING_STATUS_LABELS, frequencyLabel } from '../types';

export interface ImportContext {
  category: InspCategory;
  types: EquipmentType[]; parts: EquipmentPart[]; components: PartComponent[];
  units: InspUnit[]; companies: Company[];
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function parseFrequency(label: string, allowed: readonly number[]): number | null | 'bad' {
  const t = label.trim();
  if (!t) return null;
  const hit = allowed.find((m) => frequencyLabel(m).toLowerCase() === t.toLowerCase());
  return hit ?? 'bad';
}

function parseStatus(label: string): WorkingStatus | 'bad' {
  const t = label.trim().toLowerCase();
  if (!t) return 'in_use';
  const hit = (Object.entries(WORKING_STATUS_LABELS) as [WorkingStatus, string][])
    .find(([, l]) => l.toLowerCase() === t);
  return hit ? hit[0] : 'bad';
}

export function parseWorkbook(wb: XLSX.WorkBook, ctx: ImportContext) {
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const grid = XLSX.utils.sheet_to_json<(string | number)[]>(sheet, { header: 1, raw: false, defval: '' });
  const rows: ImportRow[] = [];
  const errors: string[] = [];
  const catTypes = ctx.types.filter((t) => t.category === ctx.category);

  grid.slice(1).forEach((cells, i) => {
    const rowNo = i + 2; // 1-based + header row
    const c = (n: number) => String(cells[n] ?? '').trim();
    if (cells.every((v) => String(v ?? '').trim() === '')) return;

    const errsBefore = errors.length;
    const typeName = c(0);
    const type = catTypes.find((t) => t.name.toLowerCase() === typeName.toLowerCase());
    if (!type) errors.push(`Row ${rowNo}: unknown Equipment "${typeName}"`);

    const partName = c(1);
    const part = type && partName
      ? ctx.parts.find((p) => p.typeId === type.id && p.name.toLowerCase() === partName.toLowerCase())
      : undefined;
    if (partName && type && !part) errors.push(`Row ${rowNo}: unknown Equipment Part "${partName}"`);

    const compName = c(2);
    const comp = part && compName
      ? ctx.components.find((k) => k.partId === part.id && k.name.toLowerCase() === compName.toLowerCase())
      : undefined;
    if (compName && part && !comp) errors.push(`Row ${rowNo}: unknown Part Component "${compName}"`);

    const unitName = c(4);
    const unit = ctx.units.find((u) => u.name.toLowerCase() === unitName.toLowerCase());
    if (!unit) errors.push(`Row ${rowNo}: unknown Unit "${unitName}"`);

    const companyName = c(5);
    const company = companyName
      ? ctx.companies.find((k) => k.name.toLowerCase() === companyName.toLowerCase())
      : undefined;
    if (companyName && !company) errors.push(`Row ${rowNo}: unknown Company "${companyName}"`);

    const status = parseStatus(c(10));
    if (status === 'bad') errors.push(`Row ${rowNo}: unknown Status "${c(10)}"`);

    const interDate = c(12); const majorDate = c(14);
    if (interDate && !ISO_DATE.test(interDate)) errors.push(`Row ${rowNo}: intermediate date "${interDate}" is not YYYY-MM-DD`);
    if (majorDate && !ISO_DATE.test(majorDate)) errors.push(`Row ${rowNo}: major date "${majorDate}" is not YYYY-MM-DD`);

    const interFreq = parseFrequency(c(13), INTERMEDIATE_FREQUENCIES);
    if (interFreq === 'bad') errors.push(`Row ${rowNo}: unknown Intermediate Frequency "${c(13)}"`);
    const majorFreq = parseFrequency(c(15), MAJOR_FREQUENCIES);
    if (majorFreq === 'bad') errors.push(`Row ${rowNo}: unknown Major Frequency "${c(15)}"`);

    if (errors.length > errsBefore) return; // never emit a row that had errors

    rows.push({
      type_id: type!.id, part_id: part?.id ?? null, component_id: comp?.id ?? null,
      unit_id: unit!.id, company_id: company?.id ?? null,
      component_description: c(3), oem: c(6), inspection_company: c(7),
      serial_number: c(8), part_number: c(9),
      working_status: status as WorkingStatus,
      manufacture_year: c(11) ? Number(c(11)) : null,
      intermediate_date: interDate || null,
      intermediate_freq_months: interFreq === null ? null : (interFreq as number),
      major_date: majorDate || null,
      major_freq_months: majorFreq === null ? null : (majorFreq as number),
      remarks: c(16), specs: {},
    });
  });

  return { rows, errors };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/modules/inspection/lib/workbookImport.test.ts` — Expected: PASS.

- [ ] **Step 6: Write `views/DataUploadView.tsx`**

```tsx
// ============================================================================
//  Data Upload — download the category template, pick an approver + file,
//  validate client-side (workbookImport) then bulk-insert via RPC.
// ============================================================================
import { useState } from 'react';
import * as XLSX from 'xlsx';
import { useInspection } from '../state/InspectionContext';
import { buildTemplateWorkbook } from '../lib/template';
import { parseWorkbook } from '../lib/workbookImport';
import { importRecords } from '../lib/records';
import { CATEGORY_LABELS, type InspCategory } from '../types';

export default function DataUploadView({ category, onDone }: {
  category: InspCategory; onDone: () => void;
}) {
  const { types, parts, components, units, companies, approvers } = useInspection();
  const [approverId, setApproverId] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const downloadTemplate = () => {
    const wb = buildTemplateWorkbook(category, { types, units, companies });
    XLSX.writeFile(wb, `inspection-template-${category}.xlsx`);
  };

  const upload = async () => {
    if (!approverId) { alert('Choose an Approve User.'); return; }
    if (!file) { alert('Choose a file.'); return; }
    setBusy(true); setErrors([]);
    try {
      const wb = XLSX.read(await file.arrayBuffer());
      const { rows, errors: errs } = parseWorkbook(wb, { category, types, parts, components, units, companies });
      if (errs.length) { setErrors(errs); return; }
      if (rows.length === 0) { setErrors(['No data rows found in the file.']); return; }
      const n = await importRecords(rows.map((r) => ({ ...r, approver_id: approverId })));
      alert(`Imported ${n} record(s) as Pending Approval.`);
      onDone();
    } catch (e) { setErrors([(e as Error).message]); }
    finally { setBusy(false); }
  };

  return (
    <div className="insp-card">
      <div className="insp-toolbar" style={{ background: 'color-mix(in srgb, var(--green) 8%, transparent)', borderRadius: 8, padding: 10 }}>
        <span style={{ fontSize: 12.5 }}>
          ⓘ Not sure of the format? Download the sample template for {CATEGORY_LABELS[category]}, fill it in, then upload it here.
        </span>
        <div style={{ flex: 1 }} />
        <button className="insp-btn" onClick={downloadTemplate}>⭳ Download Template</button>
      </div>
      <div className="insp-form-grid" style={{ marginTop: 12 }}>
        <div className="insp-field"><label>Approve User *</label>
          <select value={approverId} onChange={(e) => setApproverId(e.target.value)}>
            <option value="">Select approver…</option>
            {approvers.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select></div>
        <div className="insp-field"><label>Select file to upload</label>
          <input type="file" accept=".xlsx,.xls"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></div>
      </div>
      <div className="insp-toolbar" style={{ marginTop: 12 }}>
        <button className="insp-btn primary" disabled={busy} onClick={upload}>⇪ Upload</button>
      </div>
      {errors.length > 0 && (
        <div style={{ marginTop: 12, color: '#d33', fontSize: 12.5 }}>
          <b>Fix these and re-upload (nothing was imported):</b>
          <ul>{errors.map((e) => <li key={e}>{e}</li>)}</ul>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 7: Wire into `RecordsView.tsx`**

```tsx
import DataUploadView from './DataUploadView';
// replace the upload placeholder:
{sub === 'upload' && <DataUploadView category={category} onDone={() => setSub('display')} />}
```

- [ ] **Step 8: Verify**

Run: `npm run typecheck && npx vitest run src/modules/inspection`. Then in the app: download the Well Control template, fill 2 rows (one valid, one with a bad unit), upload — errors are row-numbered and nothing imports; after fixing, both rows land as Pending Approval.

- [ ] **Step 9: Commit**

```bash
git add src/modules/inspection
git commit -m "feat(inspection): excel template, validated workbook import, data upload view"
```

### Task 12: Equipment Components catalog manager (CRUD)

**Files:**
- Create: `src/modules/inspection/lib/catalog.ts`
- Create: `src/modules/inspection/views/CatalogView.tsx`
- Modify: `src/modules/inspection/InspectionModule.tsx` (replace `catalog` placeholder with `<CatalogView />`)

**Interfaces:**
- Consumes: `useInspection` (types/parts/components + `refreshCatalog`, `can`), `supabase` client, types (Task 4).
- Produces: `catalog.ts` with `saveType(t: { id?: string; category: InspCategory; name: string; description: string; specFields: string[] }): Promise<void>`, `deleteType(id)`, `savePart(p: { id?: string; typeId: string; name: string; description: string; position: number })`, `deletePart(id)`, `saveComponent(c: { id?: string; partId: string; name: string; description: string; position: number })`, `deleteComponent(id)`; `CatalogView` default export (list + inline detail editor: spec-field chips, parts with expandable components — source-parity).

- [ ] **Step 1: Write `lib/catalog.ts`**

```ts
// ============================================================================
//  Catalog admin writes — plain RLS-guarded table writes (insp_manage_catalog).
// ============================================================================
import { supabase } from '../../../lib/supabase';
import type { InspCategory } from '../types';

function need() {
  if (!supabase) throw new Error('Cloud not configured.');
  return supabase;
}

export async function saveType(t: {
  id?: string; category: InspCategory; name: string; description: string; specFields: string[];
}): Promise<void> {
  const sb = need();
  const row = { category: t.category, name: t.name, description: t.description, spec_fields: t.specFields };
  const { error } = t.id
    ? await sb.from('insp_equipment_types').update(row).eq('id', t.id)
    : await sb.from('insp_equipment_types').insert(row);
  if (error) throw new Error(error.message);
}

export async function deleteType(id: string): Promise<void> {
  const { error } = await need().from('insp_equipment_types').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

export async function savePart(p: {
  id?: string; typeId: string; name: string; description: string; position: number;
}): Promise<void> {
  const sb = need();
  const row = { type_id: p.typeId, name: p.name, description: p.description, position: p.position };
  const { error } = p.id
    ? await sb.from('insp_equipment_parts').update(row).eq('id', p.id)
    : await sb.from('insp_equipment_parts').insert(row);
  if (error) throw new Error(error.message);
}

export async function deletePart(id: string): Promise<void> {
  const { error } = await need().from('insp_equipment_parts').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

export async function saveComponent(c: {
  id?: string; partId: string; name: string; description: string; position: number;
}): Promise<void> {
  const sb = need();
  const row = { part_id: c.partId, name: c.name, description: c.description, position: c.position };
  const { error } = c.id
    ? await sb.from('insp_part_components').update(row).eq('id', c.id)
    : await sb.from('insp_part_components').insert(row);
  if (error) throw new Error(error.message);
}

export async function deleteComponent(id: string): Promise<void> {
  const { error } = await need().from('insp_part_components').delete().eq('id', id);
  if (error) throw new Error(error.message);
}
```

- [ ] **Step 2: Write `views/CatalogView.tsx`**

```tsx
// ============================================================================
//  Equipment Components — catalog CRUD (source parity): filterable list of
//  Category/Equipment/Description; selecting a row opens the detail editor
//  with spec-field chips and parts → components. Writes need insp_manage_catalog.
// ============================================================================
import { useMemo, useState } from 'react';
import { useInspection } from '../state/InspectionContext';
import { deleteComponent, deletePart, deleteType, saveComponent, savePart, saveType } from '../lib/catalog';
import { CATEGORY_LABELS, CATEGORY_ORDER, type EquipmentType, type InspCategory } from '../types';

export default function CatalogView() {
  const { can, types, parts, components, refreshCatalog } = useInspection();
  const editable = can('insp_manage_catalog');
  const [q, setQ] = useState('');
  const [selId, setSelId] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ id?: string; category: InspCategory; name: string; description: string; specFields: string[] } | null>(null);
  const [specInput, setSpecInput] = useState('');
  const [busy, setBusy] = useState(false);

  const list = useMemo(() => types.filter((t) =>
    !q || t.name.toLowerCase().includes(q.toLowerCase())
      || CATEGORY_LABELS[t.category].toLowerCase().includes(q.toLowerCase())), [types, q]);
  const sel = types.find((t) => t.id === selId) ?? null;
  const selParts = parts.filter((p) => p.typeId === selId);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try { await fn(); await refreshCatalog(); }
    catch (e) { alert((e as Error).message); }
    finally { setBusy(false); }
  };

  const openEdit = (t: EquipmentType | null) => {
    setDraft(t
      ? { id: t.id, category: t.category, name: t.name, description: t.description, specFields: [...t.specFields] }
      : { category: 'well_control', name: '', description: '', specFields: [] });
  };

  return (
    <div>
      <div className="insp-toolbar">
        <h2 style={{ margin: 0, fontSize: 18 }}>Equipment Components</h2>
        <span style={{ color: 'var(--dim)', fontSize: 12 }}>Manage equipment types, their parts and sub-components.</span>
        <div style={{ flex: 1 }} />
        <input placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)}
          style={{ border: '1px solid var(--line2)', borderRadius: 6, padding: '6px 9px', background: 'var(--panel)', color: 'var(--ink)' }} />
        {editable && <button className="insp-btn primary" onClick={() => openEdit(null)}>+ New Component</button>}
      </div>

      <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
        <div className="insp-table-wrap" style={{ flex: 1 }}>
          <table className="insp-table" style={{ minWidth: 520 }}>
            <thead><tr><th>Category</th><th>Equipment</th><th>Description</th><th>Actions</th></tr></thead>
            <tbody>
              {list.map((t) => (
                <tr key={t.id} style={selId === t.id ? { outline: '2px solid var(--accent)' } : {}}>
                  <td>{CATEGORY_LABELS[t.category]}</td><td>{t.name}</td><td>{t.description}</td>
                  <td style={{ display: 'flex', gap: 4 }}>
                    <button className="insp-btn" onClick={() => setSelId(t.id === selId ? null : t.id)}>ⓘ</button>
                    {editable && <>
                      <button className="insp-btn" onClick={() => { setSelId(t.id); openEdit(t); }}>✎</button>
                      <button className="insp-btn" disabled={busy}
                        onClick={() => { if (confirm(`Delete "${t.name}" and all its parts?`)) run(() => deleteType(t.id)); }}>🗑</button>
                    </>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {(sel || draft) && (
          <div className="insp-card" style={{ flex: 1, minWidth: 380 }}>
            {draft ? (
              <>
                <h3 style={{ marginTop: 0 }}>{draft.id ? 'Edit Component' : 'New Component'}</h3>
                <div className="insp-form-grid">
                  <div className="insp-field"><label>Category</label>
                    <select value={draft.category}
                      onChange={(e) => setDraft({ ...draft, category: e.target.value as InspCategory })}>
                      {CATEGORY_ORDER.map((c) => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
                    </select></div>
                  <div className="insp-field"><label>Equipment name</label>
                    <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></div>
                  <div className="insp-field" style={{ gridColumn: '1 / -1' }}><label>Description</label>
                    <input value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} /></div>
                </div>
                <div className="insp-field" style={{ marginTop: 10 }}>
                  <label>Equipment Specification fields</label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {draft.specFields.map((s) => (
                      <span key={s} className="insp-rag unknown">{s}
                        <button style={{ border: 0, background: 'none', cursor: 'pointer', color: 'inherit' }}
                          onClick={() => setDraft({ ...draft, specFields: draft.specFields.filter((x) => x !== s) })}>×</button>
                      </span>
                    ))}
                    <input placeholder="e.g. Size (in) — Enter to add" value={specInput}
                      onChange={(e) => setSpecInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && specInput.trim()) {
                          setDraft({ ...draft, specFields: [...draft.specFields, specInput.trim()] });
                          setSpecInput('');
                        }
                      }} />
                  </div>
                </div>
                <div className="insp-toolbar" style={{ marginTop: 12 }}>
                  <button className="insp-btn primary" disabled={busy || !draft.name.trim()}
                    onClick={() => run(async () => { await saveType(draft); setDraft(null); })}>💾 Save</button>
                  <button className="insp-btn" onClick={() => setDraft(null)}>Cancel</button>
                </div>
              </>
            ) : sel && (
              <>
                <h3 style={{ marginTop: 0 }}>Component Details — {sel.name}</h3>
                <div style={{ fontSize: 12.5 }}>
                  <b>Category:</b> {CATEGORY_LABELS[sel.category]}<br />
                  <b>Description:</b> {sel.description}<br />
                  <b>Specification:</b> {sel.specFields.length ? sel.specFields.join(' · ') : '—'}
                </div>
                <h4>Equipment Parts</h4>
                {selParts.map((p) => {
                  const comps = components.filter((c) => c.partId === p.id);
                  return (
                    <div key={p.id} className="insp-card" style={{ marginBottom: 8, padding: 10 }}>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <b style={{ fontSize: 12.5 }}>{p.name}</b>
                        <span style={{ color: 'var(--dim)', fontSize: 11 }}>{comps.length} components</span>
                        <div style={{ flex: 1 }} />
                        {editable && (
                          <button className="insp-btn" disabled={busy}
                            onClick={() => { if (confirm(`Delete part "${p.name}"?`)) run(() => deletePart(p.id)); }}>🗑</button>
                        )}
                      </div>
                      <ul style={{ margin: '6px 0 0 16px', fontSize: 12 }}>
                        {comps.map((c) => (
                          <li key={c.id}>{c.name}
                            {editable && (
                              <button className="insp-btn" style={{ marginLeft: 6, padding: '0 6px' }} disabled={busy}
                                onClick={() => { if (confirm(`Delete component "${c.name}"?`)) run(() => deleteComponent(c.id)); }}>×</button>
                            )}
                          </li>
                        ))}
                      </ul>
                      {editable && (
                        <button className="insp-btn" style={{ marginTop: 6 }} disabled={busy}
                          onClick={() => {
                            const name = prompt('Component name');
                            if (name?.trim()) run(() => saveComponent({ partId: p.id, name: name.trim(), description: name.trim(), position: comps.length + 1 }));
                          }}>+ Add component</button>
                      )}
                    </div>
                  );
                })}
                {editable && (
                  <button className="insp-btn" disabled={busy}
                    onClick={() => {
                      const name = prompt('Part name');
                      if (name?.trim()) run(() => savePart({ typeId: sel.id, name: name.trim(), description: name.trim(), position: selParts.length + 1 }));
                    }}>+ Add part</button>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Replace the catalog placeholder in `InspectionModule.tsx`**

```tsx
import CatalogView from './views/CatalogView';
// …
<Route path="catalog" element={<CatalogView />} />
```

- [ ] **Step 4: Verify**

Run: `npm run typecheck && npm run dev` — `/inspection/catalog` lists the 40 seeded types; as admin: create a type with spec-field chips, add a part + component, delete them; a user with only insp_view sees no edit buttons.

- [ ] **Step 5: Commit**

```bash
git add src/modules/inspection
git commit -m "feat(inspection): equipment components catalog manager"
```

---

### Task 13: Inspection Metrics view (KPIs, charts, upcoming table)

**Files:**
- Create: `src/modules/inspection/views/MetricsView.tsx`
- Modify: `src/modules/inspection/InspectionModule.tsx` (replace `metrics` placeholder with `<MetricsView />`)

**Interfaces:**
- Consumes: `fetchRecords` (Task 6), `useInspection` (units), `complianceStatus`, `daysUntil`, `recordCompliance` (Task 5), `Chart.js` (registerables — already a dependency), labels (Task 4), `EmptyState` (Task 7).
- Produces: `MetricsView` default export: unit filter; KPI cards Total / Approved / Pending Approval / Overdue; doughnut (equipment type distribution, top 10), bar (working-status distribution), bar (by category), bar (unit distribution); Upcoming Inspections table with negative "days until due" for overdue rows (source parity).

- [ ] **Step 1: Write `views/MetricsView.tsx`**

```tsx
// ============================================================================
//  Inspection Metrics — KPI cards + Chart.js charts + upcoming inspections.
//  All aggregation is client-side over the RLS-filtered record set.
// ============================================================================
import { useEffect, useMemo, useRef, useState } from 'react';
import { Chart, registerables } from 'chart.js';
import { useInspection } from '../state/InspectionContext';
import { fetchRecords } from '../lib/records';
import { complianceStatus, daysUntil, recordCompliance } from '../lib/compliance';
import { CATEGORY_LABELS, WORKING_STATUS_LABELS, type InspectionRecord } from '../types';
import { EmptyState } from '../InspectionModule';

Chart.register(...registerables);

const PALETTE = ['#2f6fd6', '#2e9e5b', '#e0a52e', '#d64545', '#8a5bd6',
  '#3aa7a0', '#d6609a', '#e07b39', '#6bab48', '#5b74d6'];

function ChartCanvas({ kind, labels, data, title }: {
  kind: 'doughnut' | 'bar' | 'line'; labels: string[]; data: number[]; title: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    const chart = new Chart(ref.current, {
      type: kind,
      data: {
        labels,
        datasets: [{
          data,
          backgroundColor: labels.map((_, i) => PALETTE[i % PALETTE.length]),
          borderColor: PALETTE[0],
        }],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: kind === 'doughnut', position: 'right' }, title: { display: false } },
      },
    });
    return () => chart.destroy();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, labels.join('|'), data.join('|')]);
  return (
    <div className="insp-card" style={{ height: 280 }}>
      <b style={{ fontSize: 12.5 }}>{title}</b>
      <div style={{ height: 230 }}><canvas ref={ref} /></div>
    </div>
  );
}

function countBy<T>(rows: T[], key: (r: T) => string): [string[], number[]] {
  const m = new Map<string, number>();
  rows.forEach((r) => m.set(key(r), (m.get(key(r)) ?? 0) + 1));
  const sorted = [...m.entries()].sort((a, b) => b[1] - a[1]);
  return [sorted.map(([k]) => k), sorted.map(([, v]) => v)];
}

export default function MetricsView() {
  const { units } = useInspection();
  const [rows, setRows] = useState<InspectionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [unitId, setUnitId] = useState('');
  const today = new Date().toISOString().slice(0, 10);

  useEffect(() => {
    fetchRecords().then((r) => { setRows(r); setLoading(false); })
      .catch((e) => { setErr((e as Error).message); setLoading(false); });
  }, []);

  const scoped = useMemo(() => unitId ? rows.filter((r) => r.unitId === unitId) : rows, [rows, unitId]);

  const kpis = useMemo(() => ({
    total: scoped.length,
    approved: scoped.filter((r) => r.approveStatus === 'approved').length,
    pending: scoped.filter((r) => r.approveStatus === 'pending_approval').length,
    overdue: scoped.filter((r) => recordCompliance(r, today) === 'overdue').length,
  }), [scoped, today]);

  const [typeLabels, typeData] = useMemo(() => {
    const [l, d] = countBy(scoped, (r) => r.typeName);
    return [l.slice(0, 10), d.slice(0, 10)];
  }, [scoped]);
  const [statusLabels, statusData] = useMemo(
    () => countBy(scoped, (r) => WORKING_STATUS_LABELS[r.workingStatus]), [scoped]);
  const [catLabels, catData] = useMemo(
    () => countBy(scoped, (r) => CATEGORY_LABELS[r.category]), [scoped]);
  const [unitLabels, unitData] = useMemo(() => countBy(scoped, (r) => r.unitName), [scoped]);
  const [companyLabels, companyData] = useMemo(
    () => countBy(scoped, (r) => r.companyName ?? 'Unassigned'), [scoped]);
  const [monthLabels, monthData] = useMemo(() => {
    const m = new Map<string, number>();
    scoped.forEach((r) => {
      [r.intermediateDate, r.majorDate].forEach((d) => {
        if (d) { const k = d.slice(0, 7); m.set(k, (m.get(k) ?? 0) + 1); }
      });
    });
    const keys = [...m.keys()].sort().slice(-12);
    return [keys, keys.map((k) => m.get(k) ?? 0)] as [string[], number[]];
  }, [scoped]);

  const upcoming = useMemo(() => {
    const items: { r: InspectionRecord; type: 'Intermediate' | 'Major'; due: string; days: number }[] = [];
    scoped.forEach((r) => {
      (['Intermediate', 'Major'] as const).forEach((t) => {
        const due = t === 'Intermediate' ? r.intermediateDueDate : r.majorDueDate;
        if (!due) return;
        const st = complianceStatus(due, today);
        if (st === 'overdue' || st === 'due_soon') {
          items.push({ r, type: t, due, days: daysUntil(due, today) ?? 0 });
        }
      });
    });
    return items.sort((a, b) => a.days - b.days).slice(0, 50);
  }, [scoped, today]);

  if (loading) return <EmptyState ico="◌" title="Loading" desc="Crunching inspection data…" />;
  if (err) return <EmptyState ico="⚠" title="Error" desc={err} />;

  return (
    <div>
      <div className="insp-toolbar">
        <h2 style={{ margin: 0, fontSize: 18 }}>Equipment Inspection Metrics</h2>
        <span style={{ color: 'var(--dim)', fontSize: 12 }}>Real-time insights and analytics for equipment inspection data</span>
        <div style={{ flex: 1 }} />
        <div className="insp-field"><label>Filter by Unit</label>
          <select value={unitId} onChange={(e) => setUnitId(e.target.value)}>
            <option value="">All Units</option>
            {units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select></div>
      </div>

      <div className="insp-kpis">
        <div className="insp-kpi"><div className="num">{kpis.total}</div><div className="lbl">Total Inspections</div></div>
        <div className="insp-kpi"><div className="num" style={{ color: 'var(--green)' }}>{kpis.approved}</div><div className="lbl">Approved</div></div>
        <div className="insp-kpi"><div className="num" style={{ color: '#b70' }}>{kpis.pending}</div><div className="lbl">Pending Approval</div></div>
        <div className="insp-kpi"><div className="num" style={{ color: '#d33' }}>{kpis.overdue}</div><div className="lbl">Overdue Inspections</div></div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 12 }}>
        <ChartCanvas kind="doughnut" labels={typeLabels} data={typeData} title="Equipment Type Distribution" />
        <ChartCanvas kind="bar" labels={statusLabels} data={statusData} title="Status Distribution" />
        <ChartCanvas kind="bar" labels={catLabels} data={catData} title="By Category" />
        <ChartCanvas kind="bar" labels={unitLabels.slice(0, 15)} data={unitData.slice(0, 15)} title="Unit Distribution" />
        <ChartCanvas kind="line" labels={monthLabels} data={monthData} title="Monthly Inspection Trends" />
        <ChartCanvas kind="bar" labels={companyLabels} data={companyData} title="Company Distribution" />
      </div>

      <div className="insp-card" style={{ marginTop: 12 }}>
        <b style={{ fontSize: 12.5 }}>Upcoming Inspections (Next 30 Days)</b>
        <div className="insp-table-wrap" style={{ marginTop: 8 }}>
          <table className="insp-table" style={{ minWidth: 700 }}>
            <thead><tr>
              <th>Serial Number</th><th>Equipment Type</th><th>Unit</th>
              <th>Inspection Type</th><th>Due Date</th><th>Days Until Due</th>
            </tr></thead>
            <tbody>
              {upcoming.map((u, i) => (
                <tr key={`${u.r.id}-${u.type}-${i}`}>
                  <td>{u.r.serialNumber || '—'}</td><td>{u.r.typeName}</td><td>{u.r.unitName}</td>
                  <td>{u.type}</td><td>{u.due}</td>
                  <td style={{ color: u.days < 0 ? '#d33' : 'inherit', fontWeight: 700 }}>{u.days} days</td>
                </tr>
              ))}
              {upcoming.length === 0 && (
                <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--dim)' }}>Nothing due in the next 30 days 🎉</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Replace the metrics placeholder in `InspectionModule.tsx`**

```tsx
import MetricsView from './views/MetricsView';
// …
<Route path="metrics" element={<MetricsView />} />
```

- [ ] **Step 3: Verify**

Run: `npm run typecheck && npm run dev` — `/inspection/metrics` renders 4 KPI cards, 6 charts (type doughnut, status/category/unit/company bars, monthly-trends line) and the upcoming table; the unit filter re-scopes everything; an overdue seeded row shows negative days in red.

- [ ] **Step 4: Commit**

```bash
git add src/modules/inspection
git commit -m "feat(inspection): metrics view - KPIs, distribution charts, upcoming inspections"
```

### Task 14: Files & certificates upgrade — storage lib + drag-drop FilesDrawer (enhancement)

**Files:**
- Create: `src/modules/inspection/lib/files.ts`
- Create: `src/modules/inspection/components/FilesDrawer.tsx`
- Modify: `src/modules/inspection/views/DataDisplayTab.tsx` (add a FILES column button that opens the drawer)

**Interfaces:**
- Consumes: `supabase` client; bucket `inspection-files` + table `insp_files` (Task 3); `InspFile`, `FileKind`, `FILE_KIND_LABELS`, `CERTIFICATE_KINDS` (Task 4); `useInspection().can('insp_manage_files')`.
- Produces: `files.ts` with `mapFile(row): InspFile`, `listFiles(recordId: string): Promise<InspFile[]>`, `listExpiringFiles(): Promise<InspFile[]>` (all rows with a non-null expiry, for alerts), `uploadFile(recordId: string, kind: FileKind, file: File, expiryDate: string | null): Promise<void>`, `deleteFile(f: InspFile): Promise<void>`, `getSignedUrl(storagePath: string): Promise<string>`; `FilesDrawer({ record, onClose }: { record: InspectionRecord; onClose: () => void })` default export.

- [ ] **Step 1: Write `lib/files.ts`**

```ts
// ============================================================================
//  Per-record documentation files — private bucket 'inspection-files',
//  metadata in insp_files (kind + optional certificate expiry feeding alerts).
// ============================================================================
import { supabase } from '../../../lib/supabase';
import type { FileKind, InspFile } from '../types';

const BUCKET = 'inspection-files';

function need() {
  if (!supabase) throw new Error('Cloud not configured.');
  return supabase;
}

export function mapFile(row: Record<string, unknown>): InspFile {
  return {
    id: String(row.id), recordId: String(row.record_id), kind: row.kind as FileKind,
    storagePath: String(row.storage_path), fileName: String(row.file_name),
    fileSize: Number(row.file_size ?? 0),
    expiryDate: (row.expiry_date as string) ?? null,
    createdAt: String(row.created_at ?? ''),
  };
}

export async function listFiles(recordId: string): Promise<InspFile[]> {
  const { data, error } = await need().from('insp_files')
    .select('*').eq('record_id', recordId).order('created_at');
  if (error) throw new Error(error.message);
  return (data ?? []).map(mapFile);
}

/** All files that carry an expiry date — the certificate-expiry alert feed. */
export async function listExpiringFiles(): Promise<InspFile[]> {
  const { data, error } = await need().from('insp_files')
    .select('*').not('expiry_date', 'is', null);
  if (error) throw new Error(error.message);
  return (data ?? []).map(mapFile);
}

export async function uploadFile(
  recordId: string, kind: FileKind, file: File, expiryDate: string | null,
): Promise<void> {
  const sb = need();
  const safeName = file.name.replace(/[^\w.\-() ]+/g, '_');
  const path = `records/${recordId}/${kind}/${Date.now()}-${safeName}`;
  const { error: upErr } = await sb.storage.from(BUCKET).upload(path, file, { upsert: false });
  if (upErr) throw new Error(upErr.message);
  const { error: dbErr } = await sb.from('insp_files').insert({
    record_id: recordId, kind, storage_path: path,
    file_name: file.name, file_size: file.size, expiry_date: expiryDate,
  });
  if (dbErr) {
    await sb.storage.from(BUCKET).remove([path]); // keep storage and metadata in sync
    throw new Error(dbErr.message);
  }
}

export async function deleteFile(f: InspFile): Promise<void> {
  const sb = need();
  const { error } = await sb.from('insp_files').delete().eq('id', f.id);
  if (error) throw new Error(error.message);
  await sb.storage.from(BUCKET).remove([f.storagePath]);
}

export async function getSignedUrl(storagePath: string): Promise<string> {
  const { data, error } = await need().storage.from(BUCKET)
    .createSignedUrl(storagePath, 60 * 10);
  if (error) throw new Error(error.message);
  return data.signedUrl;
}
```

- [ ] **Step 2: Write `components/FilesDrawer.tsx`**

```tsx
// ============================================================================
//  FilesDrawer — drag-drop multi-file upload per record, typed by the six
//  documentation kinds + Other; certificates carry an optional expiry date.
// ============================================================================
import { useCallback, useEffect, useState } from 'react';
import { deleteFile, getSignedUrl, listFiles, uploadFile } from '../lib/files';
import { useInspection } from '../state/InspectionContext';
import { CERTIFICATE_KINDS, FILE_KIND_LABELS, type FileKind, type InspFile,
  type InspectionRecord } from '../types';

function fmtSize(b: number): string {
  return b > 1_048_576 ? `${(b / 1_048_576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`;
}

export default function FilesDrawer({ record, onClose }: {
  record: InspectionRecord; onClose: () => void;
}) {
  const { can } = useInspection();
  const editable = can('insp_manage_files');
  const [files, setFiles] = useState<InspFile[]>([]);
  const [kind, setKind] = useState<FileKind>('inspection_certificate');
  const [expiry, setExpiry] = useState('');
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const isCert = CERTIFICATE_KINDS.includes(kind);

  const reload = useCallback(() => {
    listFiles(record.id).then(setFiles).catch((e) => setErr((e as Error).message));
  }, [record.id]);
  useEffect(reload, [reload]);

  const doUpload = async (list: FileList | File[]) => {
    setBusy(true); setErr(null);
    try {
      for (const f of Array.from(list)) {
        await uploadFile(record.id, kind, f, isCert && expiry ? expiry : null);
      }
      reload();
    } catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  };

  return (
    <div className="insp-drawer" role="dialog" aria-label="Record files">
      <div className="insp-toolbar">
        <b>Files — {record.serialNumber || record.typeName}</b>
        <div style={{ flex: 1 }} />
        <button className="insp-btn" onClick={onClose}>✕ Close</button>
      </div>

      {editable && (
        <>
          <div className="insp-form-grid" style={{ marginBottom: 10 }}>
            <div className="insp-field"><label>Document kind</label>
              <select value={kind} onChange={(e) => setKind(e.target.value as FileKind)}>
                {(Object.entries(FILE_KIND_LABELS) as [FileKind, string][]).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select></div>
            {isCert && (
              <div className="insp-field"><label>Certificate expiry (optional)</label>
                <input type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} /></div>
            )}
          </div>
          <div className={`insp-dropzone${drag ? ' drag' : ''}`}
            onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => { e.preventDefault(); setDrag(false); if (e.dataTransfer.files.length) doUpload(e.dataTransfer.files); }}>
            {busy ? 'Uploading…' : 'Drag & drop files here, or'}
            <div style={{ marginTop: 8 }}>
              <input type="file" multiple disabled={busy}
                onChange={(e) => e.target.files && doUpload(e.target.files)} />
            </div>
          </div>
        </>
      )}
      {err && <div style={{ color: '#d33', fontSize: 12, marginTop: 8 }}>{err}</div>}

      <div style={{ marginTop: 12 }}>
        {files.map((f) => (
          <div key={f.id} className="insp-card" style={{ marginBottom: 6, padding: 9, display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ fontSize: 16 }}>📄</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12.5, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.fileName}</div>
              <div style={{ fontSize: 11, color: 'var(--dim)' }}>
                {FILE_KIND_LABELS[f.kind]} · {fmtSize(f.fileSize)}
                {f.expiryDate && <> · expires {f.expiryDate}</>}
              </div>
            </div>
            <button className="insp-btn" onClick={async () => {
              try { window.open(await getSignedUrl(f.storagePath), '_blank'); }
              catch (e) { alert((e as Error).message); }
            }}>Open</button>
            {editable && (
              <button className="insp-btn" onClick={() => {
                if (confirm(`Delete ${f.fileName}?`)) deleteFile(f).then(reload).catch((e) => alert((e as Error).message));
              }}>🗑</button>
            )}
          </div>
        ))}
        {files.length === 0 && <div style={{ color: 'var(--dim)', fontSize: 12.5, textAlign: 'center', padding: 16 }}>No files yet.</div>}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Add the FILES column to `DataDisplayTab.tsx`**

```tsx
import FilesDrawer from '../components/FilesDrawer';
// add state near the other useState calls:
const [filesFor, setFilesFor] = useState<InspectionRecord | null>(null);
// add a "Files" <th> as the SECOND header cell (right after the checkbox column)
// in the first header row, and an empty <th /> in the search row; in each body row:
<td><button className="insp-btn" style={{ padding: '2px 8px' }} title="Documentation files"
  onClick={() => setFilesFor(r)}>📎</button></td>
// bump the empty-state colSpan from 21 to 22, and render before the closing </div>:
{filesFor && <FilesDrawer record={filesFor} onClose={() => setFilesFor(null)} />}
```

- [ ] **Step 4: Verify**

Run: `npm run typecheck && npm run dev` — open a record's 📎 drawer, drag-drop a PDF as Inspection Certificate with an expiry date; it lists with size + expiry; Open serves a signed URL; delete removes both the metadata row and the storage object (confirm in Supabase dashboard → Storage).

- [ ] **Step 5: Commit**

```bash
git add src/modules/inspection
git commit -m "feat(inspection): drag-drop files drawer with certificate expiry tracking"
```

---

### Task 15: Compliance alerts — notification bell (enhancement)

**Files:**
- Create: `src/modules/inspection/components/NotificationsBell.tsx`
- Modify: `src/modules/inspection/components/NotificationsSlot.tsx` (render the bell)

**Interfaces:**
- Consumes: `fetchRecords` (Task 6), `listExpiringFiles` (Task 14), `buildAlerts`, `AlertItem` (Task 5), `useInspection` (canAccess gate).
- Produces: `NotificationsBell` default export — badge with alert count (overdue + due-soon inspections + expiring certificates), dropdown worst-first, refreshed on mount and every 5 minutes.

- [ ] **Step 1: Write `components/NotificationsBell.tsx`**

```tsx
// ============================================================================
//  Notification bell — overdue / due-soon inspections and expiring
//  certificates, computed client-side from RLS-scoped data (Task 5 lib).
// ============================================================================
import { useEffect, useRef, useState } from 'react';
import { buildAlerts, type AlertItem } from '../lib/compliance';
import { fetchRecords } from '../lib/records';
import { listExpiringFiles } from '../lib/files';
import { useInspection } from '../state/InspectionContext';

const REFRESH_MS = 5 * 60_000;

export default function NotificationsBell() {
  const { canAccess } = useInspection();
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!canAccess) return;
    let alive = true;
    const load = async () => {
      try {
        const today = new Date().toISOString().slice(0, 10);
        const [records, files] = await Promise.all([fetchRecords(), listExpiringFiles()]);
        if (alive) setAlerts(buildAlerts(records, files, today));
      } catch { /* bell is best-effort; views surface real errors */ }
    };
    load();
    const t = setInterval(load, REFRESH_MS);
    return () => { alive = false; clearInterval(t); };
  }, [canAccess]);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  if (!canAccess) return null;
  const overdue = alerts.filter((a) => a.severity === 'overdue').length;

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <button className="insp-bell" onClick={() => setOpen((v) => !v)}
        title="Compliance alerts" aria-label={`${alerts.length} compliance alerts`}>
        🔔
        {alerts.length > 0 && <span className="badge">{alerts.length > 99 ? '99+' : alerts.length}</span>}
      </button>
      {open && (
        <div className="insp-bell-panel">
          <div className="item" style={{ fontWeight: 700 }}>
            Compliance alerts — {overdue} overdue, {alerts.length - overdue} due soon
          </div>
          {alerts.slice(0, 60).map((a) => (
            <div className="item" key={a.id}>
              <span className={`insp-rag ${a.severity}`}>
                {a.severity === 'overdue' ? 'Overdue' : 'Due Soon'}
              </span>{' '}
              {a.label}
              <div style={{ color: 'var(--dim)', fontSize: 11 }}>
                {a.kind === 'certificate' ? 'Expires' : 'Due'} {a.dueDate} ({a.daysUntil} days)
              </div>
            </div>
          ))}
          {alerts.length === 0 && <div className="item">All clear — nothing overdue or due soon. ✅</div>}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Render it from `NotificationsSlot.tsx`**

```tsx
import NotificationsBell from './NotificationsBell';

export default function NotificationsSlot() {
  return <NotificationsBell />;
}
```

- [ ] **Step 3: Verify**

Run: `npm run typecheck && npx vitest run src/modules/inspection && npm run dev` — with a seeded overdue record and an expiring certificate, the bell shows the combined count; dropdown lists overdue first, then due-soon and certificate expiries; empty DB shows "All clear".

- [ ] **Step 4: Commit**

```bash
git add src/modules/inspection
git commit -m "feat(inspection): compliance notification bell with certificate expiry alerts"
```

### Task 16: Library — document explorer

**Files:**
- Create: `src/modules/inspection/lib/library.ts`
- Create: `src/modules/inspection/views/LibraryView.tsx`
- Modify: `src/modules/inspection/InspectionModule.tsx` (replace `library` placeholder with `<LibraryView />`)

**Interfaces:**
- Consumes: `supabase` client; bucket `inspection-library` (Task 3); `useInspection().can('insp_manage_files')`.
- Produces: `library.ts` with `LibraryEntry = { name: string; isFolder: boolean; size: number; updatedAt: string }`, `listLibrary(prefix: string): Promise<LibraryEntry[]>`, `uploadLibraryFile(prefix: string, file: File): Promise<void>`, `deleteLibraryFile(path: string): Promise<void>`, `libraryUrl(path: string): Promise<string>`; `LibraryView` default export (folder navigation + files list with size/date/preview, upload for managers — source parity plus upload).

- [ ] **Step 1: Write `lib/library.ts`**

```ts
// ============================================================================
//  Library — storage-backed document explorer over the 'inspection-library'
//  bucket. Folders are storage prefixes.
// ============================================================================
import { supabase } from '../../../lib/supabase';

const BUCKET = 'inspection-library';

function need() {
  if (!supabase) throw new Error('Cloud not configured.');
  return supabase;
}

export interface LibraryEntry {
  name: string; isFolder: boolean; size: number; updatedAt: string;
}

export async function listLibrary(prefix: string): Promise<LibraryEntry[]> {
  const { data, error } = await need().storage.from(BUCKET)
    .list(prefix, { sortBy: { column: 'name', order: 'asc' } });
  if (error) throw new Error(error.message);
  return (data ?? [])
    .filter((e) => e.name !== '.emptyFolderPlaceholder')
    .map((e) => ({
      name: e.name,
      isFolder: e.id === null,                    // storage returns null id for prefixes
      size: (e.metadata?.size as number) ?? 0,
      updatedAt: (e.updated_at ?? '').slice(0, 10),
    }));
}

export async function uploadLibraryFile(prefix: string, file: File): Promise<void> {
  const path = prefix ? `${prefix}/${file.name}` : file.name;
  const { error } = await need().storage.from(BUCKET).upload(path, file, { upsert: true });
  if (error) throw new Error(error.message);
}

export async function deleteLibraryFile(path: string): Promise<void> {
  const { error } = await need().storage.from(BUCKET).remove([path]);
  if (error) throw new Error(error.message);
}

export async function libraryUrl(path: string): Promise<string> {
  const { data, error } = await need().storage.from(BUCKET).createSignedUrl(path, 60 * 10);
  if (error) throw new Error(error.message);
  return data.signedUrl;
}
```

- [ ] **Step 2: Write `views/LibraryView.tsx`**

```tsx
// ============================================================================
//  Library — file explorer (folders via prefixes) with preview/download,
//  plus upload/delete for insp_manage_files holders.
// ============================================================================
import { useCallback, useEffect, useState } from 'react';
import { useInspection } from '../state/InspectionContext';
import { deleteLibraryFile, libraryUrl, listLibrary, uploadLibraryFile,
  type LibraryEntry } from '../lib/library';
import { EmptyState } from '../InspectionModule';

function fmtSize(b: number): string {
  return b > 1_048_576 ? `${(b / 1_048_576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`;
}

export default function LibraryView() {
  const { can } = useInspection();
  const editable = can('insp_manage_files');
  const [prefix, setPrefix] = useState('');
  const [entries, setEntries] = useState<LibraryEntry[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(() => {
    listLibrary(prefix).then(setEntries).catch((e) => setErr((e as Error).message));
  }, [prefix]);
  useEffect(reload, [reload]);

  const crumbs = prefix ? prefix.split('/') : [];
  const files = entries.filter((e) => !e.isFolder);
  const folders = entries.filter((e) => e.isFolder);

  if (err) return <EmptyState ico="⚠" title="Error" desc={err} />;

  return (
    <div>
      <div className="insp-toolbar">
        <h2 style={{ margin: 0, fontSize: 18 }}>Library</h2>
        <div style={{ flex: 1 }} />
        {editable && (
          <label className="insp-btn primary" style={{ cursor: 'pointer' }}>
            ⇪ Upload file
            <input type="file" style={{ display: 'none' }} disabled={busy}
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                setBusy(true);
                try { await uploadLibraryFile(prefix, f); reload(); }
                catch (ex) { alert((ex as Error).message); }
                finally { setBusy(false); }
              }} />
          </label>
        )}
      </div>

      <div className="insp-card">
        <div style={{ fontSize: 12.5, marginBottom: 10 }}>
          <button className="insp-btn" style={{ padding: '2px 8px' }} onClick={() => setPrefix('')}>🗀 Library</button>
          {crumbs.map((c, i) => (
            <span key={i}> / <button className="insp-btn" style={{ padding: '2px 8px' }}
              onClick={() => setPrefix(crumbs.slice(0, i + 1).join('/'))}>{c}</button></span>
          ))}
        </div>

        {folders.map((f) => (
          <div key={f.name} className="insp-card" style={{ marginBottom: 6, padding: 9, display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ fontSize: 16 }}>📁</span>
            <button style={{ border: 0, background: 'none', color: 'var(--accent)', fontWeight: 600, cursor: 'pointer', fontSize: 13 }}
              onClick={() => setPrefix(prefix ? `${prefix}/${f.name}` : f.name)}>{f.name}</button>
          </div>
        ))}

        <div style={{ fontSize: 11, color: 'var(--dim)', margin: '8px 0 4px' }}>FILES ({files.length})</div>
        {files.map((f) => {
          const path = prefix ? `${prefix}/${f.name}` : f.name;
          return (
            <div key={f.name} className="insp-card" style={{ marginBottom: 6, padding: 9, display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={{ fontSize: 16 }}>📄</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12.5, fontWeight: 600 }}>{f.name}</div>
                <div style={{ fontSize: 11, color: 'var(--dim)' }}>{fmtSize(f.size)} · {f.updatedAt}</div>
              </div>
              <button className="insp-btn" onClick={async () => {
                try { window.open(await libraryUrl(path), '_blank'); }
                catch (e) { alert((e as Error).message); }
              }}>👁 Preview</button>
              {editable && (
                <button className="insp-btn" onClick={() => {
                  if (confirm(`Delete ${f.name}?`)) deleteLibraryFile(path).then(reload).catch((e) => alert((e as Error).message));
                }}>🗑</button>
              )}
            </div>
          );
        })}
        {files.length === 0 && folders.length === 0 && (
          <div style={{ color: 'var(--dim)', fontSize: 12.5, textAlign: 'center', padding: 24 }}>
            This folder is empty{editable ? ' — upload the user guide and inspection manuals here.' : '.'}
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Replace the library placeholder in `InspectionModule.tsx`**

```tsx
import LibraryView from './views/LibraryView';
// …
<Route path="library" element={<LibraryView />} />
```

- [ ] **Step 4: Verify**

Run: `npm run typecheck && npm run dev` — upload a PDF at the Library root as admin; it lists with size/date; Preview opens the signed URL; a viewer without insp_manage_files sees no upload/delete controls.

- [ ] **Step 5: Commit**

```bash
git add src/modules/inspection
git commit -m "feat(inspection): library document explorer over storage bucket"
```

---

### Task 17: Full verification, deploy check, docs

**Files:**
- Modify: `README.md` (add the Inspection module to the modules list, matching how Tubular is described)

- [ ] **Step 1: Run every gate**

```bash
npm run typecheck && npm run lint && npm test && npm run build
```
Expected: all pass; the production build code-splits `InspectionModule` into its own chunk (vite output lists a separate `InspectionModule-*.js`).

- [ ] **Step 2: End-to-end smoke pass (dev server, admin account)**

1. `/home` → Equipment Inspection card → module opens.
2. Data Entry: create a record (Air pump / Rig 103, intermediate 1 Year) → appears Pending Approval, due-date preview matched the saved row.
3. Data Display: select it → bulk-update major date → approve it → RAG chip updates.
4. Data Upload: download template → fill 1 row → upload → row lands Pending Approval.
5. Register: folder tree filters by company/unit; Overdue filter isolates an overdue seed; Export Data downloads CSV.
6. Catalog: add/edit/delete a type + part + component.
7. Metrics: KPIs/charts/upcoming reflect the data.
8. Files drawer: upload a certificate with a past expiry → bell shows the alert.
9. Library: upload + preview a PDF.
10. Sign in as a user with NO insp_* grants → module card disabled and `/inspection` shows No Access.

- [ ] **Step 3: Update README.md** — add under the existing modules section:

```markdown
### Equipment Inspection (`/inspection`)
Replica of Abraj Equipment Master Pro (einspection) as a native module: inspection
register with computed RAG compliance, per-system records with Excel upload + entry,
equipment-components catalog, metrics dashboard, per-record certificates with expiry
alerts, and a document library. DB objects are prefixed `insp_*` (migrations 0029–0031).
```

- [ ] **Step 4: Commit and push the branch; open a PR**

```bash
git add README.md
git commit -m "docs: add equipment inspection module to README"
git push -u origin feat/inspection-module
gh pr create --title "feat: Equipment Inspection module (eInspection v2)" --body "Replicates Equipment Master Pro (einspection.abrajenergy.com) as src/modules/inspection with RAG compliance + certificate-expiry alerts and drag-drop documentation files. Migrations 0029-0031 (additive, insp_* namespace)."
```

(The whole plan is executed on a feature branch `feat/inspection-module` created before Task 1 — `git checkout -b feat/inspection-module`.)

---

## Execution notes

- **Branch first:** create `feat/inspection-module` before Task 1; every task commits to it.
- **Order matters:** Tasks 1–3 (DB) → 4–6 (pure libs + service) → 7 (scaffold) → 8–16 (views/enhancements) → 17 (verification). Tasks 8–16 each replace one placeholder route, so the app builds and runs after every task.
- **Access for testing:** admin/manager roles hold every `insp_*` permission implicitly; grant `insp_view`/`insp_data_entry` rows in `user_module_permissions` to test restricted users.
- **Production data:** the live system's 6,438 rows are NOT migrated by this plan; the Data Upload path (Task 11) is the intended route — export from the old system per category, adapt to the template, upload.
