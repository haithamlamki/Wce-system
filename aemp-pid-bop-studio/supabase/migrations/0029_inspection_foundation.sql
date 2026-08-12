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
