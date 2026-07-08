-- ============================================================================
--  cloud_rpcs.sql — regression test for F12 (0012_cloud_rpcs).
--
--  Asserts:
--    1. A field user gets 42501 (not authorized) calling replace_rig_equipment.
--    2. A field user gets 42501 calling rename_unit.
--    3. A manager (is_privileged but not admin) STILL gets 42501 calling
--       replace_rig_equipment — equipment writes stay admin-only, matching
--       0003_per_rig_authorization.sql's equipment_admin_write policy
--       (my_role() = 'admin'), NOT loosened to is_privileged().
--    4. A manager CAN call rename_unit (units rename is privileged-only, per
--       0008_units.sql) and it updates units + projects + equipment together.
--    5. A rename that fails partway (duplicate unit name) leaves ALL of
--       units/projects/equipment UNCHANGED — no partial re-key.
--    6. A replace_rig_equipment call that fails partway (a row that violates
--       the `date` column type) leaves the rig's PRE-EXISTING equipment rows
--       UNCHANGED — no wiped/partial register.
--    7. A valid replace_rig_equipment call (as admin) atomically replaces the
--       register and returns the inserted row count.
--
--  This is a plain-SQL script (not pgTAP) so it needs no extra extension.
--  Each assertion is a `do $$ ... end $$;` block that RAISEs an EXCEPTION if
--  the expected behaviour doesn't hold, so a failed run aborts loudly.
--
--  HOW TO RUN (against a disposable Supabase branch — never production):
--    1. Create/select a branch:
--         supabase branches create cloud-rpcs-test   (or use an existing dev branch)
--    2. Apply migrations up to and including 0012 on that branch.
--    3. Run this script with psql against the branch's connection string:
--         psql "$BRANCH_DB_URL" -f supabase/tests/cloud_rpcs.sql
--       (or: supabase db execute --file supabase/tests/cloud_rpcs.sql --linked)
--    4. The whole script runs inside one transaction and ROLLBACKs at the end
--       (see bottom of file), so it never leaves fixture data behind.
--    5. A clean run prints only NOTICEs ending in "... OK" and exits 0.
--       Any regression raises an EXCEPTION and the script aborts non-zero.
--
--  Requires: migrations 0001-0012 already applied (profiles, my_role(),
--  is_privileged(), units, equipment, replace_rig_equipment(), rename_unit()).
--  Auth-schema caveat (as in project_versions_rls.sql): this impersonates
--  `authenticated` via `request.jwt.claims` the way PostgREST does; it does
--  not exercise Supabase Auth itself.
-- ============================================================================

begin;

-- ---- fixtures --------------------------------------------------------------

insert into auth.users (id, email) values
  ('44444444-4444-4444-4444-444444444444', 'field-c@test.local'),
  ('55555555-5555-5555-5555-555555555555', 'manager-c@test.local'),
  ('66666666-6666-6666-6666-666666666666', 'admin-c@test.local')
on conflict (id) do nothing;

insert into public.profiles (id, email, role, rig) values
  ('44444444-4444-4444-4444-444444444444', 'field-c@test.local',   'field',   'Rig A'),
  ('55555555-5555-5555-5555-555555555555', 'manager-c@test.local', 'manager', null),
  ('66666666-6666-6666-6666-666666666666', 'admin-c@test.local',   'admin',   null)
on conflict (id) do update set role = excluded.role, rig = excluded.rig;

-- units for the rename tests: 'Rig A' is renamed; 'Rig B' pre-exists so a
-- rename-to-'Rig B' collides on the unique constraint (used by test 5).
insert into public.units (name) values ('Rig A'), ('Rig B') on conflict (name) do nothing;

insert into public.projects (id, rig_name, data, created_by) values
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'Rig A', '{}'::jsonb, '44444444-4444-4444-4444-444444444444')
on conflict (id) do nothing;

insert into public.equipment (id, rig_name, tag, type) values
  ('ffffffff-ffff-ffff-ffff-ffffffffffff', 'Rig A', 'V-1', 'gate')
on conflict (id) do nothing;

-- a separate rig ('Rig C') for the replace_rig_equipment tests, kept
-- independent of the rename tests above.
insert into public.equipment (id, rig_name, tag, type) values
  ('a1111111-1111-1111-1111-111111111111', 'Rig C', 'V-10', 'gate'),
  ('a2222222-2222-2222-2222-222222222222', 'Rig C', 'V-11', 'gate')
on conflict (id) do nothing;

-- ---- helper: impersonate a user as the `authenticated` role ----------------
-- Supabase's PostgREST reads auth.uid() from the `request.jwt.claims` GUC.
-- Setting it locally + switching role reproduces that for a psql session.

-- ---- as field user (rig 'Rig A') -------------------------------------------
do $$ begin
  perform set_config('request.jwt.claims', json_build_object('sub', '44444444-4444-4444-4444-444444444444')::text, true);
end $$;
set local role authenticated;

-- 1) Field user gets 42501 from replace_rig_equipment.
do $$
begin
  begin
    perform public.replace_rig_equipment('Rig A', '[]'::jsonb);
    raise exception 'FAIL: field user was able to call replace_rig_equipment';
  exception
    when insufficient_privilege or others then
      if sqlstate <> '42501' then raise; end if;
  end;
  raise notice 'Field user gets 42501 from replace_rig_equipment ... OK';
end $$;

-- 2) Field user gets 42501 from rename_unit.
do $$
begin
  begin
    perform public.rename_unit('Rig A', 'Rig Z');
    raise exception 'FAIL: field user was able to call rename_unit';
  exception
    when insufficient_privilege or others then
      if sqlstate <> '42501' then raise; end if;
  end;
  raise notice 'Field user gets 42501 from rename_unit ... OK';
end $$;

reset role;

-- ---- as manager (is_privileged, NOT admin) ---------------------------------
do $$ begin
  perform set_config('request.jwt.claims', json_build_object('sub', '55555555-5555-5555-5555-555555555555')::text, true);
end $$;
set local role authenticated;

-- 3) Manager STILL gets 42501 from replace_rig_equipment (admin-only, not
--    loosened to is_privileged()).
do $$
begin
  begin
    perform public.replace_rig_equipment('Rig A', '[]'::jsonb);
    raise exception 'FAIL: manager (non-admin) was able to call replace_rig_equipment';
  exception
    when insufficient_privilege or others then
      if sqlstate <> '42501' then raise; end if;
  end;
  raise notice 'Manager (non-admin) gets 42501 from replace_rig_equipment ... OK';
end $$;

-- 4) Manager CAN call rename_unit — updates units + projects + equipment
--    together, in one call.
do $$
declare v_units int; v_projects int; v_equipment int;
begin
  perform public.rename_unit('Rig A', 'Rig A2');
  select count(*) into v_units from public.units where name = 'Rig A2';
  select count(*) into v_projects from public.projects where rig_name = 'Rig A2';
  select count(*) into v_equipment from public.equipment where rig_name = 'Rig A2';
  if v_units <> 1 or v_projects <> 1 or v_equipment <> 1 then
    raise exception 'FAIL: rename_unit did not update all tables (units=%, projects=%, equipment=%)', v_units, v_projects, v_equipment;
  end if;
  raise notice 'Manager rename_unit updates units+projects+equipment together ... OK';
end $$;

-- 5) A rename that fails partway (duplicate unit name) leaves EVERYTHING
--    unchanged — no partial re-key of projects/equipment while units fails
--    (or vice versa).
do $$
declare v_units int; v_projects int; v_equipment int;
begin
  begin
    perform public.rename_unit('Rig A2', 'Rig B'); -- 'Rig B' already exists -> unique_violation
    raise exception 'FAIL: rename_unit succeeded despite a duplicate target name';
  exception
    when unique_violation or others then
      if sqlstate <> '23505' then raise; end if;
  end;
  select count(*) into v_units from public.units where name = 'Rig A2';
  select count(*) into v_projects from public.projects where rig_name = 'Rig A2';
  select count(*) into v_equipment from public.equipment where rig_name = 'Rig A2';
  if v_units <> 1 or v_projects <> 1 or v_equipment <> 1 then
    raise exception 'FAIL: a failed rename partially re-keyed some tables (units=%, projects=%, equipment=%)', v_units, v_projects, v_equipment;
  end if;
  raise notice 'Failed rename leaves units/projects/equipment unchanged (all-or-none) ... OK';
end $$;

reset role;

-- ---- as admin ---------------------------------------------------------------
do $$ begin
  perform set_config('request.jwt.claims', json_build_object('sub', '66666666-6666-6666-6666-666666666666')::text, true);
end $$;
set local role authenticated;

-- 6) A replace_rig_equipment call that fails partway (a row with a malformed
--    `date` value) leaves the rig's PRE-EXISTING rows UNCHANGED — the delete
--    + insert inside the function is one atomic statement from the caller's
--    point of view, so an error anywhere rolls back everything it did.
do $$
declare v_before int; v_after int;
begin
  select count(*) into v_before from public.equipment where rig_name = 'Rig C';
  begin
    perform public.replace_rig_equipment('Rig C', '[{"tag":"V-99","type":"gate","int_last":"not-a-date"}]'::jsonb);
    raise exception 'FAIL: replace_rig_equipment succeeded despite a malformed date value';
  exception
    when others then null; -- any error is the expected outcome here
  end;
  select count(*) into v_after from public.equipment where rig_name = 'Rig C';
  if v_after <> v_before then
    raise exception 'FAIL: a failed replace left Rig C equipment changed (before=%, after=%)', v_before, v_after;
  end if;
  raise notice 'Failed replace_rig_equipment leaves the pre-existing register unchanged ... OK';
end $$;

-- 7) A valid replace_rig_equipment call atomically replaces the register and
--    returns the inserted row count.
do $$
declare v_count int; v_after int;
begin
  select public.replace_rig_equipment(
    'Rig C',
    '[{"tag":"V-20","type":"gate","section":"BOP","description":"Gate valve","int_last":"2026-01-01"},
      {"tag":"V-21","type":"gate","section":"BOP","description":"Gate valve","int_last":"2026-01-01"},
      {"tag":"V-22","type":"gate","section":"BOP","description":"Gate valve","int_last":"2026-01-01"}]'::jsonb
  ) into v_count;
  if v_count <> 3 then
    raise exception 'FAIL: replace_rig_equipment returned % instead of 3', v_count;
  end if;
  select count(*) into v_after from public.equipment where rig_name = 'Rig C';
  if v_after <> 3 then
    raise exception 'FAIL: Rig C equipment has % rows instead of 3 after replace', v_after;
  end if;
  if exists (select 1 from public.equipment where rig_name = 'Rig C' and tag = 'V-10') then
    raise exception 'FAIL: old Rig C equipment row (V-10) survived the replace';
  end if;
  raise notice 'Valid replace_rig_equipment atomically replaces the register ... OK';
end $$;

reset role;

-- Never persist fixture data — this script is a read/behaviour check only.
rollback;
