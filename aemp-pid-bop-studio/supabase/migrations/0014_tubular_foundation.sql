-- ============================================================================
--  0014_tubular_foundation.sql — Tubular Fleet Management module: foundation.
--  --------------------------------------------------------------------------
--  First migration of the Tubular module (approved plan, PR 1 of 12). Adds:
--    - unit registry extensions (unit_type/coords/active) — additive & nullable
--      or defaulted, so existing WCE reads of `units.name` are unaffected;
--    - the controlled Tubular Catalog (the workbook's hidden Lists sheet:
--      42 descriptions in 4 categories) — descriptions are NEVER a unique key
--      for inventory rows, only a classification;
--    - multi-unit user assignments (user_unit_assignments) coexisting with
--      WCE's single `profiles.rig` (my_rig() consumers untouched; existing
--      rig assignments are backfilled so nobody loses access);
--    - action-based module permissions (user_module_permissions) with SECDEF
--      helpers has_tubular_perm() / assigned_unit_ids() mirroring 0003's
--      helper style; admin/manager (is_privileged) short-circuit to all;
--    - audited admin RPCs set_user_units() / set_user_permissions() following
--      the 0012 transactional-RPC pattern + 0013 anon revoke;
--    - admin_audit_log for those configuration mutations.
--  NO tubular permission is auto-granted to existing users (explicit
--  enablement by an admin); only unit assignments are backfilled.
-- ============================================================================

-- ---- enum: tubular category (the 4 workbook groups) -------------------------
do $$ begin
  create type public.tubular_category as enum
    ('drill_pipe', 'hwdp', 'drill_collar', 'pup_joint');
exception when duplicate_object then null;
end $$;

-- ---- units: extend the existing registry (non-breaking) ---------------------
alter table public.units
  add column if not exists unit_type text not null default 'rig'
    check (unit_type in ('rig', 'hoist')),
  add column if not exists latitude  numeric,
  add column if not exists longitude numeric,
  add column if not exists active    boolean not null default true;

-- seed the 29 workbook units (24 rigs + 5 hoists); existing rows untouched
insert into public.units (name, unit_type) values
  ('Rig 103','rig'), ('Rig 104','rig'), ('Rig 105','rig'), ('Rig 106','rig'),
  ('Rig 107','rig'), ('Rig 108','rig'), ('Rig 109','rig'), ('Rig 110','rig'),
  ('Rig 111','rig'), ('Rig 201','rig'), ('Rig 202','rig'), ('Rig 203','rig'),
  ('Rig 204','rig'), ('Rig 205','rig'), ('Rig 206','rig'), ('Rig 207','rig'),
  ('Rig 208','rig'), ('Rig 209','rig'), ('Rig 210','rig'), ('Rig 302','rig'),
  ('Rig 303','rig'), ('Rig 304','rig'), ('Rig 305','rig'), ('Rig 306','rig'),
  ('Hoist 1','hoist'), ('Hoist 2','hoist'), ('Hoist 3','hoist'),
  ('Hoist 4','hoist'), ('Hoist 5','hoist')
on conflict (name) do update set unit_type = excluded.unit_type;

-- ---- tubular catalog (workbook Lists sheet, all 42 entries) ------------------
create table if not exists public.tubular_catalog (
  id          uuid primary key default gen_random_uuid(),
  category    public.tubular_category not null,
  description text not null,
  position    int  not null,            -- Lists-sheet order, drives grid/report ordering
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  unique (category, description)
);

alter table public.tubular_catalog enable row level security;

-- read: any authenticated user (dropdowns, reports). No direct write policies:
-- catalog mutations go through a manage_catalog RPC added in a later migration
-- (deactivate-only; catalog rows are referenced by inventory records).
drop policy if exists tubular_catalog_read on public.tubular_catalog;
create policy tubular_catalog_read on public.tubular_catalog
  for select to authenticated using (true);

insert into public.tubular_catalog (category, description, position) values
  ('drill_pipe', '3-1/2" DP, G-105, 13.3 ppf, NC38',        1),
  ('drill_pipe', '3-1/2" DP, G-105, 15.5 ppf, NC38',        2),
  ('drill_pipe', '4" DP, G-105, 14.0 ppf, HLIST39',         3),
  ('drill_pipe', '4" DP, G-105, 15.7 ppf, HLIST39',         4),
  ('drill_pipe', '4" DP, G-105, 14.0 ppf, XT39',            5),
  ('drill_pipe', '4" DP, G-105, 15.7 ppf, XT39',            6),
  ('drill_pipe', '4" DP, G-105, 14.0 ppf, HT40',            7),
  ('drill_pipe', '4" DP, G-105, 15.7 ppf, HT40',            8),
  ('drill_pipe', '4" DP, S-135, 15.7 ppf, XT39',            9),
  ('drill_pipe', '5" DP, G-105, 19.5 ppf, NC50',           10),
  ('drill_pipe', '5" DP, G-105, 25.6 ppf, NC50',           11),
  ('drill_pipe', '5" DP, S-135, 19.5 ppf, NC50',           12),
  ('drill_pipe', '5-1/2" DP, G-105, 24.7 ppf, DELTA544',   13),
  ('drill_pipe', '2-7/8" DP, G-105, 10.4 ppf, HTPAC',      14),
  ('hwdp',       '3-1/2" HWDP, NC38, 25.3 ppf',            15),
  ('hwdp',       '4" HWDP, HT40, R-2',                     16),
  ('hwdp',       '4" HWDP, XT39, 30.5 ppf',                17),
  ('hwdp',       '5" HWDP, NC50, 49.3 ppf',                18),
  ('hwdp',       '5" HWDP, R-2',                           19),
  ('hwdp',       '5-1/2" HWDP, DELTA544, 56.5 ppf',        20),
  ('drill_collar', '9-1/2" DC, 7-5/8" REG, 217.2 lb/ft',   21),
  ('drill_collar', '8-1/2" DC, 6-5/8" REG',                22),
  ('drill_collar', '8-1/4" DC, 6-5/8" REG, 150.3 lb/ft',   23),
  ('drill_collar', '6-3/4" DC, NC50, 101.4 lb/ft',         24),
  ('drill_collar', '6-1/2" DC, 4" IF',                     25),
  ('drill_collar', '6-1/4" DC, 4" IF (NC46)',              26),
  ('drill_collar', '6-1/2" DC, 4-1/2" IF (NC50)',          27),
  ('drill_collar', '4-3/4" DC, NC38, 47.3 lb/ft',          28),
  ('pup_joint',  '3-1/2" PUP, G-105, NC38, 13.3 ppf',      29),
  ('pup_joint',  '3-1/2" PUP, G-105, NC38, 15.5 ppf',      30),
  ('pup_joint',  '4" PUP, G-105, HLIST39, 14.0 ppf',       31),
  ('pup_joint',  '4" PUP, G-105, HLIST39, 15.7 ppf',       32),
  ('pup_joint',  '4" PUP, G-105, XT39, 14.0 ppf',          33),
  ('pup_joint',  '4" PUP, G-105, XT39, 15.7 ppf',          34),
  ('pup_joint',  '4" PUP, G-105, HT40, 14.0 ppf',          35),
  ('pup_joint',  '4" PUP, G-105, HT40, 15.7 ppf',          36),
  ('pup_joint',  '4" PUP, S-135, XT39, 15.7 ppf',          37),
  ('pup_joint',  '5" PUP, G-105, NC50, 19.5 ppf',          38),
  ('pup_joint',  '5" PUP, G-105, NC50, 25.6 ppf',          39),
  ('pup_joint',  '5" PUP, S-135, NC50, 19.5 ppf',          40),
  ('pup_joint',  '5-1/2" PUP, G-105, DELTA544, 24.7 ppf',  41),
  ('pup_joint',  '2-7/8" PUP, G-105, HTPAC, 10.4 ppf',     42)
on conflict (category, description) do nothing;

-- ---- multi-unit assignments --------------------------------------------------
create table if not exists public.user_unit_assignments (
  user_id     uuid not null references auth.users(id) on delete cascade,
  unit_id     uuid not null references public.units(id) on delete cascade,
  assigned_by uuid references auth.users(id),
  assigned_at timestamptz not null default now(),
  primary key (user_id, unit_id)
);

alter table public.user_unit_assignments enable row level security;

drop policy if exists user_unit_assignments_read on public.user_unit_assignments;
create policy user_unit_assignments_read on public.user_unit_assignments
  for select to authenticated
  using (user_id = auth.uid() or public.is_privileged());
-- writes only via set_user_units() below (audited)

-- backfill: every profile with a WCE rig keeps that unit in the tubular module
insert into public.user_unit_assignments (user_id, unit_id)
select p.id, u.id
from public.profiles p
join public.units u on u.name = p.rig
where p.rig is not null
on conflict do nothing;

-- ---- action-based module permissions ------------------------------------------
create table if not exists public.user_module_permissions (
  user_id    uuid not null references auth.users(id) on delete cascade,
  permission text not null check (permission in (
    'view',              -- access the module, assigned units only
    'view_fleet',        -- fleet-wide read
    'data_entry',        -- enter/save unit data (assigned units)
    'approve_movements',
    'approve_orders',
    'manage_orders',
    'manage_catalog',
    'manage_contracts',
    'import',
    'export',
    'manage_assignments'
  )),
  granted_by uuid references auth.users(id),
  granted_at timestamptz not null default now(),
  primary key (user_id, permission)
);

alter table public.user_module_permissions enable row level security;

drop policy if exists user_module_permissions_read on public.user_module_permissions;
create policy user_module_permissions_read on public.user_module_permissions
  for select to authenticated
  using (user_id = auth.uid() or public.is_privileged());
-- writes only via set_user_permissions() below (audited)

-- ---- SECDEF helpers (0003 style) ----------------------------------------------
-- admin/manager (is_privileged) implicitly hold every permission and every unit,
-- consistent with how WCE treats those roles.
create or replace function public.has_tubular_perm(p text) returns boolean
  language sql security definer stable set search_path = public as
$$ select public.is_privileged()
     or exists (select 1 from public.user_module_permissions
                where user_id = auth.uid() and permission = p) $$;

create or replace function public.assigned_unit_ids() returns setof uuid
  language sql security definer stable set search_path = public as
$$ select u.id from public.units u
   where public.is_privileged()
      or exists (select 1 from public.user_unit_assignments a
                 where a.unit_id = u.id and a.user_id = auth.uid()) $$;

revoke all on function public.has_tubular_perm(text) from public;
revoke execute on function public.has_tubular_perm(text) from anon;
grant execute on function public.has_tubular_perm(text) to authenticated;

revoke all on function public.assigned_unit_ids() from public;
revoke execute on function public.assigned_unit_ids() from anon;
grant execute on function public.assigned_unit_ids() to authenticated;

-- ---- admin audit log ------------------------------------------------------------
create table if not exists public.admin_audit_log (
  id        uuid primary key default gen_random_uuid(),
  actor     uuid not null,
  action    text not null,
  entity    text not null,
  entity_id text,
  detail    jsonb,
  at        timestamptz not null default now()
);

alter table public.admin_audit_log enable row level security;

drop policy if exists admin_audit_log_read on public.admin_audit_log;
create policy admin_audit_log_read on public.admin_audit_log
  for select to authenticated using (public.is_privileged());
-- no write policies: rows are written only by SECURITY DEFINER RPCs

-- ---- audited admin RPCs (0012 pattern) -------------------------------------------
-- Replace the full unit-assignment set for one user, atomically, with audit.
create or replace function public.set_user_units(p_user uuid, p_unit_ids uuid[])
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- NULL-safe guard (see 0012): a caller with no profile row must be rejected.
  if not public.is_privileged() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  delete from public.user_unit_assignments where user_id = p_user;
  insert into public.user_unit_assignments (user_id, unit_id, assigned_by)
  select p_user, x, auth.uid() from unnest(coalesce(p_unit_ids, '{}')) as x;

  insert into public.admin_audit_log (actor, action, entity, entity_id, detail)
  values (auth.uid(), 'set_user_units', 'user_unit_assignments', p_user::text,
          jsonb_build_object('unit_ids', to_jsonb(coalesce(p_unit_ids, '{}'))));
end;
$$;

revoke all on function public.set_user_units(uuid, uuid[]) from public;
revoke execute on function public.set_user_units(uuid, uuid[]) from anon;
grant execute on function public.set_user_units(uuid, uuid[]) to authenticated;

-- Replace the full permission set for one user, atomically, with audit.
-- Invalid permission names are rejected by the table's CHECK constraint,
-- which rolls back the whole call (no partial grant).
create or replace function public.set_user_permissions(p_user uuid, p_perms text[])
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_privileged() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  delete from public.user_module_permissions where user_id = p_user;
  insert into public.user_module_permissions (user_id, permission, granted_by)
  select p_user, x, auth.uid() from unnest(coalesce(p_perms, '{}')) as x;

  insert into public.admin_audit_log (actor, action, entity, entity_id, detail)
  values (auth.uid(), 'set_user_permissions', 'user_module_permissions', p_user::text,
          jsonb_build_object('permissions', to_jsonb(coalesce(p_perms, '{}'))));
end;
$$;

revoke all on function public.set_user_permissions(uuid, text[]) from public;
revoke execute on function public.set_user_permissions(uuid, text[]) from anon;
grant execute on function public.set_user_permissions(uuid, text[]) to authenticated;
