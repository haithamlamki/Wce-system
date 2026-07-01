-- ============================================================================
--  0008_units.sql — user-manageable units (rigs).
--  A "unit" is a rig: it owns a P&ID drawing (a row in `projects`, keyed by
--  rig_name) plus its equipment register and manuals. Until now the selectable
--  units were hard-coded in the client; this table makes them admin-managed.
--  Everyone authenticated can read the list; only admins/managers (is_privileged)
--  may add / rename / remove units.
-- ============================================================================

create table if not exists public.units (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  created_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now()
);

alter table public.units enable row level security;

-- read: any authenticated user (so the unit switcher is populated for field crews)
drop policy if exists units_read on public.units;
create policy units_read on public.units
  for select to authenticated using (true);

-- write: privileged only (admin / manager)
drop policy if exists units_insert on public.units;
create policy units_insert on public.units
  for insert to authenticated with check (public.is_privileged());

drop policy if exists units_update on public.units;
create policy units_update on public.units
  for update to authenticated using (public.is_privileged()) with check (public.is_privileged());

drop policy if exists units_delete on public.units;
create policy units_delete on public.units
  for delete to authenticated using (public.is_privileged());

-- seed the existing rigs so nothing disappears on first load
insert into public.units (name) values ('Rig 103'), ('Rig 303'), ('Rig 305')
  on conflict (name) do nothing;
