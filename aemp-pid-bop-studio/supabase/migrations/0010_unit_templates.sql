-- ============================================================================
--  0010_unit_templates.sql — per-unit reusable start templates.
--  Each unit (rig) may have ONE saved template: a Project-shaped JSONB doc used
--  to seed a fresh draft ("start from template"). Everyone authenticated can
--  read a template (so anyone can start a diagram from it); only admins/managers
--  (is_privileged) may save / replace / delete one. Mirrors 0008_units.sql /
--  0009_symbols.sql.
-- ============================================================================

create table if not exists public.unit_templates (
  rig_name   text primary key,
  data       jsonb not null,            -- Project doc used to seed a new draft
  updated_by uuid references auth.users(id) default auth.uid(),
  updated_at timestamptz not null default now()
);

-- keep updated_at fresh on every write (touch_updated_at() is defined in 0001)
drop trigger if exists unit_templates_touch on public.unit_templates;
create trigger unit_templates_touch before update on public.unit_templates
  for each row execute function public.touch_updated_at();

alter table public.unit_templates enable row level security;

-- read: any authenticated user (so anyone can start a diagram from a template)
drop policy if exists unit_templates_read on public.unit_templates;
create policy unit_templates_read on public.unit_templates
  for select to authenticated using (true);

-- write: privileged only (admin / manager)
drop policy if exists unit_templates_insert on public.unit_templates;
create policy unit_templates_insert on public.unit_templates
  for insert to authenticated with check (public.is_privileged());

drop policy if exists unit_templates_update on public.unit_templates;
create policy unit_templates_update on public.unit_templates
  for update to authenticated using (public.is_privileged()) with check (public.is_privileged());

drop policy if exists unit_templates_delete on public.unit_templates;
create policy unit_templates_delete on public.unit_templates
  for delete to authenticated using (public.is_privileged());
