-- ============================================================================
--  0027: Phase 1 — unit-centric data model.
--
--  Turns the flat, rig_name-keyed store into a real hierarchy:
--      Unit ── many named Diagrams  +  many named Templates
--
--  Design decisions (approved): evolve `projects` in place (its rows ARE the
--  diagrams — preserves the 0026 optimistic-lock guard, RLS and history), and a
--  single implicit project (units are the top level; no project container).
--
--  Everything here is ADDITIVE and BACKWARD-COMPATIBLE: legacy rig_name and
--  unit_templates paths keep working and are kept in sync by triggers, so the
--  current UI is unaffected until the Phase 2 Project Manager rewires to
--  unit_id. Applied to Supabase project reutvufibeezhknxdudc.
-- ============================================================================

-- (A) Ensure a unit row exists for every rig referenced by existing data, so
--     the unit list is authoritative (built-ins 103/303/305 seeded in 0008).
insert into public.units (name)
  select rig_name from public.projects where rig_name is not null
  union
  select rig_name from public.unit_templates
on conflict (name) do nothing;

-- (B) Diagrams = projects rows. Add unit linkage + a human-readable name.
alter table public.projects add column if not exists unit_id uuid references public.units(id);
alter table public.projects add column if not exists name text;
create index if not exists projects_unit_id_idx on public.projects (unit_id);

update public.projects p set unit_id = u.id
  from public.units u
  where p.unit_id is null and u.name = p.rig_name;

update public.projects set name =
    coalesce(nullif(name, ''),
             nullif(rig_name, '') || coalesce(' · ' || reference_date::text, ''),
             'Untitled diagram')
  where name is null or name = '';

-- Auto-organization (requirement #5): every diagram write ensures its unit
-- exists, links unit_id, and defaults a name if none — so a newly created
-- diagram always appears under its owning unit with no manual moving.
create or replace function public.projects_link_unit()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.rig_name is not null and new.unit_id is null then
    insert into public.units (name) values (new.rig_name) on conflict (name) do nothing;
    select id into new.unit_id from public.units where name = new.rig_name;
  end if;
  if new.name is null or new.name = '' then
    new.name := coalesce(nullif(new.rig_name, ''), 'Diagram')
             || coalesce(' · ' || new.reference_date::text, '');
  end if;
  return new;
end $$;

drop trigger if exists projects_link_unit on public.projects;
create trigger projects_link_unit
  before insert or update on public.projects
  for each row execute function public.projects_link_unit();

-- (C) Templates: multiple named templates per unit (was one-per-rig text key).
create table if not exists public.templates (
  id         uuid primary key default gen_random_uuid(),
  unit_id    uuid not null references public.units(id) on delete cascade,
  name       text not null default 'Template',
  data       jsonb not null,
  version    integer not null default 1,
  created_by uuid references auth.users(id) default auth.uid(),
  updated_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists templates_unit_id_idx on public.templates (unit_id);

drop trigger if exists templates_touch on public.templates;
create trigger templates_touch before update on public.templates
  for each row execute function public.touch_updated_at();

alter table public.templates enable row level security;
drop policy if exists templates_read on public.templates;
create policy templates_read on public.templates
  for select to authenticated using (true);
drop policy if exists templates_insert on public.templates;
create policy templates_insert on public.templates
  for insert to authenticated with check (public.is_privileged());
drop policy if exists templates_update on public.templates;
create policy templates_update on public.templates
  for update to authenticated using (public.is_privileged()) with check (public.is_privileged());
drop policy if exists templates_delete on public.templates;
create policy templates_delete on public.templates
  for delete to authenticated using (public.is_privileged());

-- Migrate the existing one-per-rig templates into the new table (idempotent).
insert into public.templates (unit_id, name, data, updated_by, updated_at)
  select u.id, 'Template', ut.data, ut.updated_by, ut.updated_at
  from public.unit_templates ut
  join public.units u on u.name = ut.rig_name
  where not exists (
    select 1 from public.templates t where t.unit_id = u.id and t.name = 'Template'
  );

-- Transition safety (no data loss): keep the legacy unit_templates path mirrored
-- into the new table so template edits made by the CURRENT UI aren't lost before
-- Phase 2 switches the client over. Dropped once Phase 2 lands.
create or replace function public.sync_unit_template_to_templates()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_unit uuid;
begin
  select id into v_unit from public.units where name = new.rig_name;
  if v_unit is null then
    insert into public.units (name) values (new.rig_name) on conflict (name) do nothing;
    select id into v_unit from public.units where name = new.rig_name;
  end if;
  update public.templates
    set data = new.data, updated_by = new.updated_by, version = version + 1
    where unit_id = v_unit and name = 'Template';
  if not found then
    insert into public.templates (unit_id, name, data, updated_by)
    values (v_unit, 'Template', new.data, new.updated_by);
  end if;
  return new;
end $$;

drop trigger if exists unit_templates_sync on public.unit_templates;
create trigger unit_templates_sync
  after insert or update on public.unit_templates
  for each row execute function public.sync_unit_template_to_templates();

-- (D) Guarded template save — same transactional optimistic lock as diagrams
--     (0026), so multiple admins can't silently clobber a shared template.
create or replace function public.save_template_guarded(
  p_id uuid,
  p_expected_version integer,
  p_unit_id uuid,
  p_name text,
  p_data jsonb
) returns table (id uuid, version integer, updated_at timestamptz, updated_by uuid)
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_id  uuid;
  v_cur integer;
begin
  if not public.is_privileged() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  if p_id is null then
    insert into public.templates (unit_id, name, data, created_by, updated_by, version)
    values (p_unit_id, coalesce(nullif(p_name, ''), 'Template'), p_data, v_uid, v_uid, 1)
    returning public.templates.id into v_id;
  else
    select t.version into v_cur from public.templates t where t.id = p_id for update;
    if not found then
      raise exception 'template_not_found' using errcode = 'P0002';
    end if;
    if p_expected_version is not null and v_cur is not null and v_cur <> p_expected_version then
      raise exception 'save_conflict' using errcode = '40001';
    end if;
    update public.templates t
      set data = p_data,
          name = coalesce(nullif(p_name, ''), t.name),
          version = coalesce(t.version, 1) + 1,
          updated_by = v_uid
      where t.id = p_id
      returning t.id into v_id;
  end if;

  return query
    select t.id, t.version, t.updated_at, t.updated_by
    from public.templates t where t.id = v_id;
end $$;

revoke all on function public.save_template_guarded(uuid,integer,uuid,text,jsonb) from anon, public;
grant execute on function public.save_template_guarded(uuid,integer,uuid,text,jsonb) to authenticated;
