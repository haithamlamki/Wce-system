-- ============================================================================
--  project_versions_rls.sql — regression test for F3 (0011_project_versions_rls).
--
--  Asserts:
--    1. A field user on Rig A cannot SELECT a Rig B project_versions row.
--    2. A field user cannot INSERT a version row for a rig_name other than
--       their own (public.my_rig()).
--    3. A field user cannot INSERT a version row with created_by != auth.uid()
--       (i.e. cannot forge history on another user's behalf).
--    4. A field user on Rig A CAN insert/select their own rig's rows.
--    5. An admin (is_privileged()) can SELECT rows across all rigs.
--
--  This is a plain-SQL script (not pgTAP) so it needs no extra extension.
--  Each assertion is a `do $$ ... end $$;` block that RAISEs an EXCEPTION if
--  the expected behaviour doesn't hold, so a failed run aborts loudly.
--
--  HOW TO RUN (against a disposable Supabase branch — never production):
--    1. Create/select a branch:
--         supabase branches create rls-test   (or use an existing dev branch)
--    2. Apply migrations up to and including 0011 on that branch.
--    3. Run this script with psql against the branch's connection string:
--         psql "$BRANCH_DB_URL" -f supabase/tests/project_versions_rls.sql
--       (or: supabase db execute --file supabase/tests/project_versions_rls.sql --linked)
--    4. The whole script runs inside one transaction and ROLLBACKs at the end
--       (see bottom of file), so it never leaves fixture data behind.
--    5. A clean run prints only NOTICEs ending in "... OK" and exits 0.
--       Any RLS regression raises an EXCEPTION and the script aborts non-zero.
--
--  Requires: migrations 0001-0011 already applied (profiles, my_rig(),
--  is_privileged(), project_versions with the 0011 policies).
-- ============================================================================

begin;

-- ---- fixtures --------------------------------------------------------------

-- Two field users (Rig A, Rig B) + one admin. auth.users rows are minimal —
-- just enough for the FK from profiles and for auth.uid() impersonation below.
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'field-a@test.local'),
  ('22222222-2222-2222-2222-222222222222', 'field-b@test.local'),
  ('33333333-3333-3333-3333-333333333333', 'admin@test.local')
on conflict (id) do nothing;

insert into public.profiles (id, email, role, rig) values
  ('11111111-1111-1111-1111-111111111111', 'field-a@test.local', 'field', 'Rig A'),
  ('22222222-2222-2222-2222-222222222222', 'field-b@test.local', 'field', 'Rig B'),
  ('33333333-3333-3333-3333-333333333333', 'admin@test.local',  'admin', null)
on conflict (id) do update set role = excluded.role, rig = excluded.rig;

-- One project + one version row per rig, owned by that rig's field user.
-- Inserted as postgres (bypasses RLS) purely to seed fixtures.
insert into public.projects (id, rig_name, data, created_by) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Rig A', '{}'::jsonb, '11111111-1111-1111-1111-111111111111'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Rig B', '{}'::jsonb, '22222222-2222-2222-2222-222222222222')
on conflict (id) do nothing;

insert into public.project_versions (id, project_id, rig_name, data, created_by) values
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Rig A', '{}'::jsonb, '11111111-1111-1111-1111-111111111111'),
  ('dddddddd-dddd-dddd-dddd-dddddddddddd', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Rig B', '{}'::jsonb, '22222222-2222-2222-2222-222222222222')
on conflict (id) do nothing;

-- ---- helper: impersonate a user as the `authenticated` role ----------------
-- Supabase's PostgREST reads auth.uid() from the `request.jwt.claims` GUC.
-- Setting it locally + switching role reproduces that for a psql session.
do $$ begin
  perform set_config('request.jwt.claims', json_build_object('sub', '11111111-1111-1111-1111-111111111111')::text, true);
end $$;
set local role authenticated;

-- 1) Field user on Rig A must NOT see Rig B's version row.
do $$
declare cnt int;
begin
  select count(*) into cnt from public.project_versions where id = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
  if cnt <> 0 then
    raise exception 'FAIL: field user on Rig A could read Rig B project_versions row';
  end if;
  raise notice 'Rig A user cannot read Rig B version row ... OK';
end $$;

-- 2) Field user on Rig A CAN see their own rig's row.
do $$
declare cnt int;
begin
  select count(*) into cnt from public.project_versions where id = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
  if cnt <> 1 then
    raise exception 'FAIL: field user on Rig A could not read their own rig''s project_versions row';
  end if;
  raise notice 'Rig A user can read their own rig version row ... OK';
end $$;

-- 3) Field user on Rig A cannot INSERT a version row for Rig B (wrong rig_name).
do $$
begin
  begin
    insert into public.project_versions (project_id, rig_name, data, created_by)
    values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Rig B', '{}'::jsonb, '11111111-1111-1111-1111-111111111111');
    raise exception 'FAIL: field user on Rig A was able to insert a Rig B version row';
  exception
    when insufficient_privilege or others then
      -- RLS violations surface as `new row violates row-level security policy`
      -- (SQLSTATE 42501) — any rejection here is the expected outcome.
      if sqlstate <> '42501' then raise; end if;
  end;
  raise notice 'Rig A user cannot insert a Rig B version row ... OK';
end $$;

-- 4) Field user on Rig A cannot INSERT a version row forging created_by as
--    another user, even for their own rig.
do $$
begin
  begin
    insert into public.project_versions (project_id, rig_name, data, created_by)
    values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Rig A', '{}'::jsonb, '22222222-2222-2222-2222-222222222222');
    raise exception 'FAIL: field user on Rig A was able to forge created_by as another user';
  exception
    when insufficient_privilege or others then
      if sqlstate <> '42501' then raise; end if;
  end;
  raise notice 'Rig A user cannot forge created_by ... OK';
end $$;

-- 5) Field user on Rig A CAN insert a legitimate version row for their own rig.
do $$
begin
  insert into public.project_versions (project_id, rig_name, data, created_by)
  values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Rig A', '{}'::jsonb, '11111111-1111-1111-1111-111111111111');
  raise notice 'Rig A user can insert their own legitimate version row ... OK';
end $$;

-- ---- switch to the admin user -----------------------------------------------
do $$ begin
  perform set_config('request.jwt.claims', json_build_object('sub', '33333333-3333-3333-3333-333333333333')::text, true);
end $$;

-- 6) Admin (is_privileged()) can see rows from BOTH rigs.
do $$
declare cnt int;
begin
  select count(*) into cnt from public.project_versions
   where id in ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'dddddddd-dddd-dddd-dddd-dddddddddddd');
  if cnt <> 2 then
    raise exception 'FAIL: admin could not read version rows across both rigs (got % of 2)', cnt;
  end if;
  raise notice 'Admin can read version rows across all rigs ... OK';
end $$;

reset role;

-- Never persist fixture data — this script is a read/behaviour check only.
rollback;
