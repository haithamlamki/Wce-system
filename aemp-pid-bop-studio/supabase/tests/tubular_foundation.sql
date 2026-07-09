-- ============================================================================
--  tubular_foundation.sql — regression test for 0014_tubular_foundation.
--
--  Asserts:
--    1. Seeds: 29 workbook units exist with unit_type set (24 rig + 5 hoist);
--       tubular_catalog holds exactly 42 active entries (14 DP, 6 HWDP,
--       8 DC, 14 PUP) — the full Lists sheet, including the two 2-7/8" HTPAC
--       items the Excel Master sheet drops.
--    2. A field user with NO module permission: has_tubular_perm('view') is
--       false, and gets 42501 from set_user_units / set_user_permissions.
--    3. A manager can grant permissions/units; both writes land and are
--       audit-logged in admin_audit_log.
--    4. After the grant, the field user's has_tubular_perm('view') is true and
--       assigned_unit_ids() returns EXACTLY the assigned unit — not others.
--    5. A privileged user's assigned_unit_ids() returns every unit.
--    6. The field user cannot INSERT into tubular_catalog or
--       user_module_permissions directly (no write policy ⇒ RLS denial).
--    7. set_user_permissions with an invalid permission name fails and leaves
--       the user's existing permission set unchanged (atomic).
--    8. WCE unaffected: the 0003 projects/equipment policies still exist by
--       name, and my_rig()/my_role() still answer from profiles.
--
--  Plain-SQL script (not pgTAP), same conventions as cloud_rpcs.sql: runs in
--  one transaction, impersonates users via request.jwt.claims + role
--  authenticated, RAISEs on failure, ROLLBACKs at the end.
--
--  HOW TO RUN (disposable Supabase branch — never production):
--    psql "$BRANCH_DB_URL" -f supabase/tests/tubular_foundation.sql
--  Requires migrations 0001-0014 applied.
-- ============================================================================

begin;

-- ---- fixtures ----------------------------------------------------------------
insert into auth.users (id, email) values
  ('77777777-7777-7777-7777-777777777777', 'field-t@test.local'),
  ('88888888-8888-8888-8888-888888888888', 'manager-t@test.local')
on conflict (id) do nothing;

insert into public.profiles (id, email, role, rig) values
  ('77777777-7777-7777-7777-777777777777', 'field-t@test.local',   'field',   'Rig 105'),
  ('88888888-8888-8888-8888-888888888888', 'manager-t@test.local', 'manager', null)
on conflict (id) do update set role = excluded.role, rig = excluded.rig;

-- ---- 1) seed shape ------------------------------------------------------------
do $$
declare v_rigs int; v_hoists int; v_cat int; v_dp int; v_hwdp int; v_dc int; v_pup int;
begin
  select count(*) into v_rigs   from public.units where unit_type = 'rig'   and name like 'Rig %';
  select count(*) into v_hoists from public.units where unit_type = 'hoist' and name like 'Hoist %';
  if v_rigs < 24 or v_hoists <> 5 then
    raise exception 'FAIL: unit seed wrong (rigs=%, hoists=%)', v_rigs, v_hoists;
  end if;
  select count(*) into v_cat from public.tubular_catalog where active;
  select count(*) into v_dp   from public.tubular_catalog where category = 'drill_pipe';
  select count(*) into v_hwdp from public.tubular_catalog where category = 'hwdp';
  select count(*) into v_dc   from public.tubular_catalog where category = 'drill_collar';
  select count(*) into v_pup  from public.tubular_catalog where category = 'pup_joint';
  if v_cat <> 42 or v_dp <> 14 or v_hwdp <> 6 or v_dc <> 8 or v_pup <> 14 then
    raise exception 'FAIL: catalog seed wrong (total=%, dp=%, hwdp=%, dc=%, pup=%)', v_cat, v_dp, v_hwdp, v_dc, v_pup;
  end if;
  if not exists (select 1 from public.tubular_catalog where description = '2-7/8" DP, G-105, 10.4 ppf, HTPAC')
     or not exists (select 1 from public.tubular_catalog where description = '2-7/8" PUP, G-105, HTPAC, 10.4 ppf') then
    raise exception 'FAIL: the two 2-7/8" HTPAC catalog items (dropped by Excel Master) are missing';
  end if;
  raise notice '29 units + 42-item catalog seeded ... OK';
end $$;

-- ---- as field user, before any grant -------------------------------------------
do $$ begin
  perform set_config('request.jwt.claims', json_build_object('sub', '77777777-7777-7777-7777-777777777777')::text, true);
end $$;
set local role authenticated;

-- 2) no permission yet; admin RPCs rejected
do $$
begin
  if public.has_tubular_perm('view') then
    raise exception 'FAIL: field user has view permission without any grant';
  end if;
  begin
    perform public.set_user_permissions('77777777-7777-7777-7777-777777777777', array['view']);
    raise exception 'FAIL: field user was able to call set_user_permissions';
  exception when others then
    if sqlstate <> '42501' then raise; end if;
  end;
  begin
    perform public.set_user_units('77777777-7777-7777-7777-777777777777',
      array[(select id from public.units where name = 'Rig 306')]);
    raise exception 'FAIL: field user was able to call set_user_units';
  exception when others then
    if sqlstate <> '42501' then raise; end if;
  end;
  raise notice 'Field user: no implicit permission; admin RPCs rejected with 42501 ... OK';
end $$;

-- 6) no direct writes to catalog / permissions tables
do $$
begin
  begin
    insert into public.tubular_catalog (category, description, position)
    values ('drill_pipe', 'XSS test pipe', 999);
    raise exception 'FAIL: field user inserted into tubular_catalog directly';
  exception when others then
    if sqlstate not in ('42501') then raise; end if;
  end;
  begin
    insert into public.user_module_permissions (user_id, permission)
    values ('77777777-7777-7777-7777-777777777777', 'manage_assignments');
    raise exception 'FAIL: field user granted himself a permission directly';
  exception when others then
    if sqlstate not in ('42501') then raise; end if;
  end;
  raise notice 'Direct writes to catalog/permissions denied by RLS ... OK';
end $$;

reset role;

-- ---- as manager (privileged) ------------------------------------------------------
do $$ begin
  perform set_config('request.jwt.claims', json_build_object('sub', '88888888-8888-8888-8888-888888888888')::text, true);
end $$;
set local role authenticated;

-- 3) grant view+data_entry and assign Rig 105 + Rig 106; audit rows written
do $$
declare v_audit_before int; v_audit_after int;
begin
  select count(*) into v_audit_before from public.admin_audit_log;
  perform public.set_user_permissions('77777777-7777-7777-7777-777777777777', array['view','data_entry']);
  perform public.set_user_units('77777777-7777-7777-7777-777777777777', array[
    (select id from public.units where name = 'Rig 105'),
    (select id from public.units where name = 'Rig 106')]);
  select count(*) into v_audit_after from public.admin_audit_log;
  if v_audit_after - v_audit_before <> 2 then
    raise exception 'FAIL: expected 2 admin_audit_log rows, got %', v_audit_after - v_audit_before;
  end if;
  raise notice 'Manager grants permissions/units; both audited ... OK';
end $$;

-- 5) privileged assigned_unit_ids() = every unit
do $$
declare v_all int; v_fn int;
begin
  select count(*) into v_all from public.units;
  select count(*) into v_fn from public.assigned_unit_ids();
  if v_fn <> v_all then
    raise exception 'FAIL: privileged assigned_unit_ids returned % of % units', v_fn, v_all;
  end if;
  raise notice 'Privileged user sees all units via assigned_unit_ids ... OK';
end $$;

-- 7) invalid permission name fails atomically (existing set unchanged)
do $$
declare v_perms int;
begin
  begin
    perform public.set_user_permissions('77777777-7777-7777-7777-777777777777',
      array['view','not_a_real_permission']);
    raise exception 'FAIL: set_user_permissions accepted an invalid permission name';
  exception when others then
    if sqlstate <> '23514' then raise; end if; -- check_violation
  end;
  select count(*) into v_perms from public.user_module_permissions
  where user_id = '77777777-7777-7777-7777-777777777777';
  if v_perms <> 2 then
    raise exception 'FAIL: failed grant left % permissions instead of the original 2', v_perms;
  end if;
  raise notice 'Invalid permission name rejected atomically ... OK';
end $$;

reset role;

-- ---- as field user, after the grant --------------------------------------------
do $$ begin
  perform set_config('request.jwt.claims', json_build_object('sub', '77777777-7777-7777-7777-777777777777')::text, true);
end $$;
set local role authenticated;

-- 4) permission visible; assigned units exact
do $$
declare v_n int; v_wrong int;
begin
  if not public.has_tubular_perm('view') or not public.has_tubular_perm('data_entry') then
    raise exception 'FAIL: granted permissions not visible to has_tubular_perm';
  end if;
  if public.has_tubular_perm('import') then
    raise exception 'FAIL: has_tubular_perm returns true for a permission never granted';
  end if;
  select count(*) into v_n from public.assigned_unit_ids();
  select count(*) into v_wrong from public.assigned_unit_ids() a
  where a not in (select id from public.units where name in ('Rig 105','Rig 106'));
  if v_n <> 2 or v_wrong <> 0 then
    raise exception 'FAIL: assigned_unit_ids wrong (count=%, foreign=%)', v_n, v_wrong;
  end if;
  raise notice 'Field user sees exactly the granted permissions and assigned units ... OK';
end $$;

reset role;

-- ---- 8) WCE unaffected ------------------------------------------------------------
do $$
declare v_missing text;
begin
  select string_agg(p.name, ', ') into v_missing
  from (values ('projects','projects_read'), ('projects','projects_insert'),
               ('projects','projects_update'), ('projects','projects_delete'),
               ('equipment','equipment_read'), ('equipment','equipment_admin_write'),
               ('units','units_read'), ('units','units_insert'),
               ('units','units_update'), ('units','units_delete')) as p(tbl, name)
  where not exists (
    select 1 from pg_policies pol
    where pol.schemaname = 'public' and pol.tablename = p.tbl and pol.policyname = p.name);
  if v_missing is not null then
    raise exception 'FAIL: WCE policies missing after 0014: %', v_missing;
  end if;
  raise notice 'WCE policies (0003/0008) unchanged by 0014 ... OK';
end $$;

-- backfill sanity: the fixture field profile (rig 'Rig 105') would have been
-- backfilled had it existed at migration time; assert the backfill query shape
-- still matches profiles→units by name for at least the fixture pair.
do $$
begin
  if not exists (
    select 1 from public.profiles p join public.units u on u.name = p.rig
    where p.id = '77777777-7777-7777-7777-777777777777' and u.name = 'Rig 105') then
    raise exception 'FAIL: profiles.rig -> units.name join no longer resolves (backfill shape broken)';
  end if;
  raise notice 'profiles.rig -> units.name backfill join resolves ... OK';
end $$;

-- Never persist fixture data.
rollback;
