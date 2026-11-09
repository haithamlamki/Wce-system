-- ============================================================================
--  0053 — Major Overhaul (MOH) register + dashboard, replacing the standalone
--  "MOH Multi-Rig 10-Year Planner" HTML with database-backed data.
--
--    1. permissions moh:view / moh:update (granted to roles holding dashboard:view)
--    2. insp_moh_items       — the equipment master (48 Abraj defaults), global
--    3. insp_moh_item_types  — item → inspection equipment types; their major
--                              inspection dates auto-fill "last MOH" per rig
--    4. insp_moh_rig_items   — per-rig applicability (missing row = applicable)
--    5. insp_moh_units       — manually entered units (asset no., last MOH date /
--                              year / hours); any unit for a rig+item overrides
--                              the inspection auto-fill
--    6. insp_moh_projects    — per-year project details (status, PO/PR, vendor…)
--    7. insp_moh_inspection_dates() — the auto-fill aggregate, scope-checked
--  Rig rows are scoped exactly like insp_records (insp_unit_ids()).
-- ============================================================================

-- ---- 1) permissions ------------------------------------------------------------
insert into public.insp_permissions (key, resource, action) values
  ('moh:view', 'moh', 'view'), ('moh:update', 'moh', 'update')
on conflict (key) do nothing;

insert into public.insp_role_permissions (role_id, permission_key)
select distinct rp.role_id, 'moh:view' from public.insp_role_permissions rp
where rp.permission_key = 'dashboard:view'
on conflict do nothing;

-- ---- 2) equipment master ---------------------------------------------------------
create table if not exists public.insp_moh_items (
  id             uuid primary key default gen_random_uuid(),
  sno            integer not null,
  description    text not null check (btrim(description) <> ''),
  category       text not null default 'Other' check (category in (
                   'Engines / Power Generation','Drilling Equipment','Well Control','Hoisting Equipment',
                   'Hydraulic Systems','Tanks','Handling Equipment','Well Services','Electrical Equipment','Other')),
  interval_basis text not null default 'years' check (interval_basis in ('years','hours')),
  -- calendar years or operating hours, per interval_basis; null = not yet set
  interval_value integer check (interval_value is null or interval_value > 0),
  active         boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create unique index if not exists insp_moh_items_description on public.insp_moh_items (lower(btrim(description)));
drop trigger if exists insp_moh_items_touch on public.insp_moh_items;
create trigger insp_moh_items_touch before update on public.insp_moh_items
  for each row execute function public.touch_updated_at();

insert into public.insp_moh_items (sno, description, interval_value, category, interval_basis)
select v.sno, v.d, v.f, v.c, v.b from (values
  (1,'All Main Engine-Gen in Rig & Camp – Major Inframe Overhaul',null,'Engines / Power Generation','hours'),
  (2,'All Main Engine-Gen in Rig & Camp – Major Overhaul',null,'Engines / Power Generation','hours'),
  (3,'Top Drive',5,'Drilling Equipment','years'),
  (4,'Choke Manifold',5,'Well Control','years'),
  (5,'Mud Pump',8,'Drilling Equipment','years'),
  (6,'Drawworks',10,'Hoisting Equipment','years'),
  (7,'Electric Brake',5,'Hoisting Equipment','years'),
  (8,'Mast & Sub Raising Cylinders – Fast Moving Rigs / 1000 & 1500 HP Rigs',3,'Hydraulic Systems','years'),
  (9,'Mast & Sub Raising Cylinders – Heavy Rigs / 2000 HP Rigs',5,'Hydraulic Systems','years'),
  (10,'Iron Roughneck',3,'Handling Equipment','years'),
  (11,'BOP',5,'Well Control','years'),
  (12,'BOP Control Unit / Koomey Unit',5,'Well Control','years'),
  (13,'Crown Block',5,'Hoisting Equipment','years'),
  (14,'Travelling Block',5,'Hoisting Equipment','years'),
  (15,'Forklift',5,'Handling Equipment','years'),
  (16,'Man Lift',5,'Handling Equipment','years'),
  (17,'Pipe Cat',5,'Handling Equipment','years'),
  (18,'Water Tanks and Camp Major Repair',10,'Tanks','years'),
  (19,'Fuel Tanks and Mud Tanks',10,'Tanks','years'),
  (20,'Casing Running Tool',5,'Well Services','years'),
  (21,'Carrier Transmission',5,'Handling Equipment','years'),
  (22,'Rotary Table & Transmission',5,'Drilling Equipment','years'),
  (23,'Stand Pipe Manifold & HP Lines',5,'Well Control','years'),
  (24,'Vacuum & Poor-Boy Degasser',5,'Well Control','years'),
  (25,'AC/DC Motors',5,'Electrical Equipment','years'),
  (26,'Driller''s Cabin',10,'Other','years'),
  (27,'Mast Dolly System',5,'Handling Equipment','years'),
  (28,'Mast',10,'Hoisting Equipment','years'),
  (29,'Substructure',10,'Hoisting Equipment','years'),
  (30,'BOP Handling System – PDO',3,'Handling Equipment','years'),
  (31,'BOP Handling System – Non-PDO',5,'Handling Equipment','years'),
  (32,'Lower Guide Arm',5,'Handling Equipment','years'),
  (33,'Mechanized Pipe Pins',5,'Handling Equipment','years'),
  (34,'Power Slips',5,'Handling Equipment','years'),
  (35,'BX Elevator',5,'Handling Equipment','years'),
  (36,'Tubulars',3,'Well Services','years'),
  (37,'Tank Sand Blasting / Coating',3,'Tanks','years'),
  (38,'Frac Pump Unit Overhaul GD3000',5,'Well Services','years'),
  (39,'Cement Unit Overhaul',5,'Well Services','years'),
  (40,'Power Pack Overhaul',5,'Hydraulic Systems','years'),
  (41,'Trailer Overhaul',5,'Handling Equipment','years'),
  (42,'Data Acquisition System Upgrade',5,'Electrical Equipment','years'),
  (43,'Tubing Injector',5,'Well Services','years'),
  (44,'Well Head Isolation Tool Overhaul',2,'Well Services','years'),
  (45,'Cement Head Overhaul',5,'Well Services','years'),
  (46,'Lab Equipment Overhaul',5,'Other','years'),
  (47,'Hydraulic System Re-hosing',5,'Hydraulic Systems','years'),
  (48,'C-Pump Overhaul',5,'Well Services','years')
) v(sno, d, f, c, b)
on conflict do nothing;

-- ---- 3) item → inspection equipment type links ----------------------------------
create table if not exists public.insp_moh_item_types (
  item_id uuid not null references public.insp_moh_items(id) on delete cascade,
  type_id uuid not null references public.insp_equipment_types(id) on delete cascade,
  primary key (item_id, type_id)
);
create index if not exists insp_moh_item_types_type on public.insp_moh_item_types (type_id);

-- Paired items (fast-moving vs heavy, PDO vs non-PDO) link only the shorter,
-- more conservative interval; a rig can switch via applicability + links.
insert into public.insp_moh_item_types (item_id, type_id)
select i.id, t.id from (values
  ('Top Drive','Top drive System'),
  ('Choke Manifold','Choke Manifold'),
  ('Mud Pump','Mud Pump'),
  ('Drawworks','Draw works'),
  ('Electric Brake','Eddy current brake'),
  ('Mast & Sub Raising Cylinders – Fast Moving Rigs / 1000 & 1500 HP Rigs','Mast & Substructure raising cylinder'),
  ('Iron Roughneck','Iron Roughneck'),
  ('BOP','BOP'), ('BOP','Annular BOP'), ('BOP','Double Ram Preventer'),
  ('BOP','Single Ram Preventer'), ('BOP','Single Ram BOP'),
  ('BOP Control Unit / Koomey Unit','BOP Control unit'),
  ('Crown Block','Crown block'),
  ('Travelling Block','Traveling block and hook blocks'),
  ('Pipe Cat','Pipe Cat'),
  ('Fuel Tanks and Mud Tanks','Fuel Tanks'), ('Fuel Tanks and Mud Tanks','Diesel Tank'),
  ('Casing Running Tool','Casing Running Tool'),
  ('Carrier Transmission','Rig Carrier'),
  ('Rotary Table & Transmission','Rotary table'),
  ('Stand Pipe Manifold & HP Lines','Standpipe manifold'), ('Stand Pipe Manifold & HP Lines','High Pressure Hose'),
  ('Vacuum & Poor-Boy Degasser','Vacuum Degasser'), ('Vacuum & Poor-Boy Degasser','Mud Gas Seperator (MGS)'),
  ('AC/DC Motors','AC Traction Motors'), ('AC/DC Motors','TDS AC Traction motor'),
  ('Mast Dolly System','Substructure Moving Dolly'),
  ('Mast','Mast'),
  ('Substructure','Substructure'),
  ('BOP Handling System – PDO','BOP handling system'),
  ('Mechanized Pipe Pins','Mechanized Pipe Bins'),
  ('Tubulars','Drill Pipes'), ('Tubulars','Heavy Weight Drill Pipe'), ('Tubulars','Drill Collar'),
  ('Power Pack Overhaul','HPU Diesel'),
  ('Trailer Overhaul','Trailer')
) v(item, type_name)
join public.insp_moh_items i on i.description = v.item
join public.insp_equipment_types t on t.name = v.type_name
on conflict do nothing;

-- ---- 4) per-rig applicability --------------------------------------------------
create table if not exists public.insp_moh_rig_items (
  unit_id    uuid not null references public.units(id) on delete cascade,
  item_id    uuid not null references public.insp_moh_items(id) on delete cascade,
  applicable boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (unit_id, item_id)
);
drop trigger if exists insp_moh_rig_items_touch on public.insp_moh_rig_items;
create trigger insp_moh_rig_items_touch before update on public.insp_moh_rig_items
  for each row execute function public.touch_updated_at();

-- ---- 5) manually entered units --------------------------------------------------
create table if not exists public.insp_moh_units (
  id                 uuid primary key default gen_random_uuid(),
  unit_id            uuid not null references public.units(id) on delete cascade,
  item_id            uuid not null references public.insp_moh_items(id) on delete cascade,
  asset_number       text not null default '',
  equipment_number   text not null default '',
  last_moh_date      date,
  last_moh_year      integer check (last_moh_year is null or last_moh_year between 1900 and 2200),
  last_moh_hours     numeric check (last_moh_hours is null or last_moh_hours >= 0),
  current_hours      numeric check (current_hours is null or current_hours >= 0),
  avg_hours_per_year numeric check (avg_hours_per_year is null or avg_hours_per_year >= 0),
  remarks            text not null default '',
  created_by         uuid references auth.users(id) default auth.uid(),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index if not exists insp_moh_units_rig on public.insp_moh_units (unit_id, item_id);
drop trigger if exists insp_moh_units_touch on public.insp_moh_units;
create trigger insp_moh_units_touch before update on public.insp_moh_units
  for each row execute function public.touch_updated_at();

-- ---- 6) per-year project details -------------------------------------------------
create table if not exists public.insp_moh_projects (
  id            uuid primary key default gen_random_uuid(),
  unit_id       uuid not null references public.units(id) on delete cascade,
  item_id       uuid not null references public.insp_moh_items(id) on delete cascade,
  -- null = the rig-level row (inspection auto-fill or no unit entered yet)
  moh_unit_id   uuid references public.insp_moh_units(id) on delete cascade,
  plan_year     integer not null check (plan_year between 1900 and 2200),
  planned_month smallint check (planned_month is null or planned_month between 1 and 12),
  start_date    date,
  duration_days integer check (duration_days is null or duration_days >= 0),
  vendor        text not null default '',
  po_number     text not null default '',
  pr_number     text not null default '',
  responsible   text not null default '',
  status        text not null default 'Not Started' check (status in (
                  'Not Started','Planning','PR Raised','PO Issued','Equipment Sent',
                  'Under Overhaul','Testing','Completed','Deferred')),
  comments      text not null default '',
  updated_by    uuid references auth.users(id) default auth.uid(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create unique index if not exists insp_moh_projects_key on public.insp_moh_projects
  (unit_id, item_id, coalesce(moh_unit_id, '00000000-0000-0000-0000-000000000000'::uuid), plan_year);
drop trigger if exists insp_moh_projects_touch on public.insp_moh_projects;
create trigger insp_moh_projects_touch before update on public.insp_moh_projects
  for each row execute function public.touch_updated_at();

-- ---- RLS ---------------------------------------------------------------------------
alter table public.insp_moh_items      enable row level security;
alter table public.insp_moh_item_types enable row level security;
alter table public.insp_moh_rig_items  enable row level security;
alter table public.insp_moh_units      enable row level security;
alter table public.insp_moh_projects   enable row level security;

do $$ declare t text; begin
  -- global master tables
  foreach t in array array['insp_moh_items','insp_moh_item_types'] loop
    execute format('drop policy if exists %I on public.%I', t || '_read', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.has_insp_perm(''moh:view''))', t || '_read', t);
    execute format('drop policy if exists %I on public.%I', t || '_write', t);
    execute format('create policy %I on public.%I for all to authenticated using (public.has_insp_perm(''moh:update'')) with check (public.has_insp_perm(''moh:update''))', t || '_write', t);
  end loop;
  -- rig-scoped tables
  foreach t in array array['insp_moh_rig_items','insp_moh_units','insp_moh_projects'] loop
    execute format('drop policy if exists %I on public.%I', t || '_read', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.has_insp_perm(''moh:view'') and unit_id in (select public.insp_unit_ids()))', t || '_read', t);
    execute format('drop policy if exists %I on public.%I', t || '_write', t);
    execute format('create policy %I on public.%I for all to authenticated using (public.has_insp_perm(''moh:update'') and unit_id in (select public.insp_unit_ids())) with check (public.has_insp_perm(''moh:update'') and unit_id in (select public.insp_unit_ids()))', t || '_write', t);
  end loop;
end $$;

grant select, insert, update, delete on public.insp_moh_items, public.insp_moh_item_types,
  public.insp_moh_rig_items, public.insp_moh_units, public.insp_moh_projects to authenticated;

-- ---- 7) inspection auto-fill ---------------------------------------------------------
-- One row per rig × MOH item: the OLDEST major-inspection date among the linked
-- in-service, approved components (conservative — the item is only as current as
-- its least-recently inspected component). Security definer so moh:view holders
-- need no inspection:view, but still limited to their scoped rigs.
create or replace function public.insp_moh_inspection_dates()
returns table (unit_id uuid, item_id uuid, last_major date, next_major_due date,
               components integer, overdue_components integer)
language sql security definer stable set search_path = public as
$$ select r.unit_id, l.item_id, min(r.major_date), min(r.major_due_date),
          count(*)::int, count(*) filter (where r.major_due_date < current_date)::int
   from public.insp_records r
   join public.insp_moh_item_types l on l.type_id = r.type_id
   where public.has_insp_perm('moh:view')
     and r.unit_id in (select public.insp_unit_ids())
     and r.approve_status = 'approved' and r.working_status = 'in_use'
     and r.major_date is not null
   group by r.unit_id, l.item_id $$;
revoke all on function public.insp_moh_inspection_dates() from public, anon;
grant execute on function public.insp_moh_inspection_dates() to authenticated;
