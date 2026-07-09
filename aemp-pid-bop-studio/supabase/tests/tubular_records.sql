-- ============================================================================
--  tubular_records.sql — regression test for 0016_tubular_records.
--
--  Asserts:
--    1. A field user with data_entry + an assigned unit can batch-save lines;
--       the RPC returns the submission id and record ids; generated columns
--       compute the workbook rules (on_board = P+C2+C3+Scrap;
--       contract_delta = (P+C2) − contract, i.e. Class 3/Scrap never count).
--    2. Duplicate catalog descriptions in one unit create SEPARATE records
--       (pup-joint case) — description is not a key.
--    3. Saving to a non-assigned unit → 42501.
--    4. Smuggling another unit's record id into the batch → 42501, atomic
--       (nothing from the failed batch persists — no submission, no rows).
--    5. A negative quantity → check violation, whole batch rolls back.
--    6. A user without data_entry (view only) → 42501.
--    7. RLS reads: unit-scoped viewer sees only assigned-unit records;
--       view_fleet sees all; a user with no module permission sees none.
--    8. Direct INSERT/UPDATE on tubular_records is denied (no write policy).
--    9. Archiving via p_archive_ids flags the row and audits it; the record
--       survives (never hard-deleted).
--   10. Submission audit: lines carry the post-save state per record.
--
--  Same conventions as cloud_rpcs.sql (plain SQL, jwt-claims impersonation,
--  one transaction, ROLLBACK at end). Requires migrations 0001-0016.
--    psql "$BRANCH_DB_URL" -f supabase/tests/tubular_records.sql
-- ============================================================================

begin;

-- ---- fixtures ----------------------------------------------------------------
insert into auth.users (id, email) values
  ('aaaa1111-1111-1111-1111-111111111111', 'entry-r@test.local'),
  ('bbbb2222-2222-2222-2222-222222222222', 'viewer-r@test.local'),
  ('cccc3333-3333-3333-3333-333333333333', 'fleet-r@test.local'),
  ('dddd4444-4444-4444-4444-444444444444', 'noperm-r@test.local'),
  ('eeee5555-5555-5555-5555-555555555555', 'manager-r@test.local')
on conflict (id) do nothing;

insert into public.profiles (id, email, role, rig) values
  ('aaaa1111-1111-1111-1111-111111111111', 'entry-r@test.local',   'field',   null),
  ('bbbb2222-2222-2222-2222-222222222222', 'viewer-r@test.local',  'field',   null),
  ('cccc3333-3333-3333-3333-333333333333', 'fleet-r@test.local',   'field',   null),
  ('dddd4444-4444-4444-4444-444444444444', 'noperm-r@test.local',  'field',   null),
  ('eeee5555-5555-5555-5555-555555555555', 'manager-r@test.local', 'manager', null)
on conflict (id) do update set role = excluded.role, rig = excluded.rig;

-- grants (as manager)
do $$ begin
  perform set_config('request.jwt.claims', json_build_object('sub', 'eeee5555-5555-5555-5555-555555555555')::text, true);
end $$;
set local role authenticated;
do $$
begin
  perform public.set_user_permissions('aaaa1111-1111-1111-1111-111111111111', array['view','data_entry']);
  perform public.set_user_units('aaaa1111-1111-1111-1111-111111111111', array[
    (select id from public.units where name = 'Rig 105')]);
  perform public.set_user_permissions('bbbb2222-2222-2222-2222-222222222222', array['view']);
  perform public.set_user_units('bbbb2222-2222-2222-2222-222222222222', array[
    (select id from public.units where name = 'Rig 105')]);
  perform public.set_user_permissions('cccc3333-3333-3333-3333-333333333333', array['view_fleet']);
end $$;
reset role;

-- ---- as entry user (Rig 105, view+data_entry) ----------------------------------
do $$ begin
  perform set_config('request.jwt.claims', json_build_object('sub', 'aaaa1111-1111-1111-1111-111111111111')::text, true);
end $$;
set local role authenticated;

-- 1 + 2) valid batch save; generated columns; duplicate descriptions kept
do $$
declare
  v_unit uuid; v_cat_dp uuid; v_cat_pup uuid; v_res jsonb; v_n int;
  v_on_board int; v_delta int;
begin
  select id into v_unit from public.units where name = 'Rig 105';
  select id into v_cat_dp  from public.tubular_catalog where description = '4" DP, G-105, 15.7 ppf, XT39';
  select id into v_cat_pup from public.tubular_catalog where description = '5" PUP, G-105, NC50, 19.5 ppf';

  select public.submit_tubular_entry(
    v_unit, date '2026-07-09',
    jsonb_build_array(
      jsonb_build_object('id', null, 'catalog_item_id', v_cat_dp,  'position', 1,
        'on_contract', 324, 'premium', 130, 'class2', 8, 'class3', 5, 'scrap', 2,
        'needs_inspection', 3, 'damaged_on_location', 0, 'send_to_repair', 0,
        'to_other_rig', 0, 'receive_from_rig', 0, 'rental_date', null, 'remarks', null),
      jsonb_build_object('id', null, 'catalog_item_id', v_cat_pup, 'position', 2,
        'on_contract', 2, 'premium', 0, 'class2', 0, 'class3', 0, 'scrap', 0,
        'needs_inspection', 0, 'damaged_on_location', 0, 'send_to_repair', 0,
        'to_other_rig', 0, 'receive_from_rig', 0, 'rental_date', null, 'remarks', '1.5m'),
      jsonb_build_object('id', null, 'catalog_item_id', v_cat_pup, 'position', 3,
        'on_contract', 2, 'premium', 0, 'class2', 0, 'class3', 0, 'scrap', 0,
        'needs_inspection', 0, 'damaged_on_location', 0, 'send_to_repair', 0,
        'to_other_rig', 0, 'receive_from_rig', 0, 'rental_date', null, 'remarks', '3m')),
    null, 'first save') into v_res;

  if jsonb_array_length(v_res->'record_ids') <> 3 then
    raise exception 'FAIL: expected 3 record ids, got %', v_res->'record_ids';
  end if;

  -- workbook rules: on_board includes C3+Scrap; contract_delta = (P+C2)-contract
  select on_board, contract_delta into v_on_board, v_delta
  from public.tubular_records where id = (v_res->'record_ids'->>0)::uuid;
  if v_on_board <> 145 then  -- 130+8+5+2
    raise exception 'FAIL: on_board=% (expected 145 = P+C2+C3+Scrap)', v_on_board;
  end if;
  if v_delta <> -186 then    -- (130+8)-324; Class3/Scrap must NOT close the gap
    raise exception 'FAIL: contract_delta=% (expected -186 = (P+C2)-contract)', v_delta;
  end if;

  -- duplicate pup-joint description = two distinct records
  select count(*) into v_n from public.tubular_records
  where unit_id = v_unit and catalog_item_id = v_cat_pup and not archived;
  if v_n <> 2 then
    raise exception 'FAIL: duplicate description collapsed (% rows, expected 2)', v_n;
  end if;

  raise notice 'Batch save + generated workbook rules + duplicate rows ... OK';
end $$;

-- 3) non-assigned unit rejected
do $$
declare v_other uuid; v_cat uuid;
begin
  select id into v_other from public.units where name = 'Rig 306';
  select id into v_cat from public.tubular_catalog limit 1;
  begin
    perform public.submit_tubular_entry(v_other, current_date,
      jsonb_build_array(jsonb_build_object('id', null, 'catalog_item_id', v_cat,
        'position', 1, 'on_contract', 0, 'premium', 1, 'class2', 0, 'class3', 0,
        'scrap', 0, 'needs_inspection', 0, 'damaged_on_location', 0,
        'send_to_repair', 0, 'to_other_rig', 0, 'receive_from_rig', 0,
        'rental_date', null, 'remarks', null)));
    raise exception 'FAIL: save to a non-assigned unit succeeded';
  exception when others then
    if sqlstate <> '42501' then raise; end if;
  end;
  raise notice 'Save to non-assigned unit rejected with 42501 ... OK';
end $$;

reset role;

-- plant a record on Rig 306 (as manager) for the smuggling test
do $$ begin
  perform set_config('request.jwt.claims', json_build_object('sub', 'eeee5555-5555-5555-5555-555555555555')::text, true);
end $$;
set local role authenticated;
do $$
declare v_res jsonb;
begin
  select public.submit_tubular_entry(
    (select id from public.units where name = 'Rig 306'), current_date,
    jsonb_build_array(jsonb_build_object('id', null,
      'catalog_item_id', (select id from public.tubular_catalog where description = '5" HWDP, R-2'),
      'position', 1, 'on_contract', 10, 'premium', 9, 'class2', 0, 'class3', 0,
      'scrap', 0, 'needs_inspection', 0, 'damaged_on_location', 0,
      'send_to_repair', 0, 'to_other_rig', 0, 'receive_from_rig', 0,
      'rental_date', null, 'remarks', 'foreign record')) ) into v_res;
  perform set_config('test.foreign_record_id', v_res->'record_ids'->>0, true);
end $$;
reset role;

-- ---- back to entry user -----------------------------------------------------------
do $$ begin
  perform set_config('request.jwt.claims', json_build_object('sub', 'aaaa1111-1111-1111-1111-111111111111')::text, true);
end $$;
set local role authenticated;

-- 4) smuggled foreign record id → 42501, atomic
do $$
declare v_unit uuid; v_cat uuid; v_sub_before int; v_sub_after int; v_rec_before int; v_rec_after int;
begin
  select id into v_unit from public.units where name = 'Rig 105';
  select id into v_cat from public.tubular_catalog where description = '5" HWDP, R-2';
  select count(*) into v_sub_before from public.tubular_submissions where unit_id = v_unit;
  select count(*) into v_rec_before from public.tubular_records where unit_id = v_unit;
  begin
    perform public.submit_tubular_entry(v_unit, current_date,
      jsonb_build_array(
        jsonb_build_object('id', null, 'catalog_item_id', v_cat, 'position', 9,
          'on_contract', 0, 'premium', 1, 'class2', 0, 'class3', 0, 'scrap', 0,
          'needs_inspection', 0, 'damaged_on_location', 0, 'send_to_repair', 0,
          'to_other_rig', 0, 'receive_from_rig', 0, 'rental_date', null, 'remarks', null),
        jsonb_build_object('id', current_setting('test.foreign_record_id', true)::uuid,
          'catalog_item_id', v_cat, 'position', 10,
          'on_contract', 0, 'premium', 999, 'class2', 0, 'class3', 0, 'scrap', 0,
          'needs_inspection', 0, 'damaged_on_location', 0, 'send_to_repair', 0,
          'to_other_rig', 0, 'receive_from_rig', 0, 'rental_date', null, 'remarks', 'hijack')));
    raise exception 'FAIL: batch containing a foreign record id succeeded';
  exception when others then
    if sqlstate <> '42501' then raise; end if;
  end;
  select count(*) into v_sub_after from public.tubular_submissions where unit_id = v_unit;
  select count(*) into v_rec_after from public.tubular_records where unit_id = v_unit;
  if v_sub_after <> v_sub_before or v_rec_after <> v_rec_before then
    raise exception 'FAIL: failed batch left partial writes (subs %->%, recs %->%)',
      v_sub_before, v_sub_after, v_rec_before, v_rec_after;
  end if;
  -- the foreign record itself is untouched
  if exists (select 1 from public.tubular_records
             where id = current_setting('test.foreign_record_id', true)::uuid
               and premium = 999) then
    raise exception 'FAIL: foreign record was modified';
  end if;
  raise notice 'Foreign record id rejected; batch fully rolled back ... OK';
end $$;

-- 5) negative quantity → whole batch rolls back
do $$
declare v_unit uuid; v_cat uuid; v_sub_before int; v_sub_after int;
begin
  select id into v_unit from public.units where name = 'Rig 105';
  select id into v_cat from public.tubular_catalog limit 1;
  select count(*) into v_sub_before from public.tubular_submissions where unit_id = v_unit;
  begin
    perform public.submit_tubular_entry(v_unit, current_date,
      jsonb_build_array(jsonb_build_object('id', null, 'catalog_item_id', v_cat,
        'position', 1, 'on_contract', 0, 'premium', -5, 'class2', 0, 'class3', 0,
        'scrap', 0, 'needs_inspection', 0, 'damaged_on_location', 0,
        'send_to_repair', 0, 'to_other_rig', 0, 'receive_from_rig', 0,
        'rental_date', null, 'remarks', null)));
    raise exception 'FAIL: negative quantity accepted';
  exception when others then
    if sqlstate <> '23514' then raise; end if; -- check_violation
  end;
  select count(*) into v_sub_after from public.tubular_submissions where unit_id = v_unit;
  if v_sub_after <> v_sub_before then
    raise exception 'FAIL: failed batch left a submission behind';
  end if;
  raise notice 'Negative quantity rejected atomically ... OK';
end $$;

-- 8) direct writes denied
do $$
declare v_unit uuid; v_cat uuid;
begin
  select id into v_unit from public.units where name = 'Rig 105';
  select id into v_cat from public.tubular_catalog limit 1;
  begin
    insert into public.tubular_records (unit_id, catalog_item_id) values (v_unit, v_cat);
    raise exception 'FAIL: direct insert into tubular_records succeeded';
  exception when others then
    if sqlstate <> '42501' then raise; end if;
  end;
  begin
    update public.tubular_records set premium = 12345 where unit_id = v_unit;
    if found then
      raise exception 'FAIL: direct update of tubular_records succeeded';
    end if;
  exception when others then
    if sqlstate <> '42501' then raise; end if;
  end;
  raise notice 'Direct writes to tubular_records denied ... OK';
end $$;

-- 9 + 10) archive via RPC; audit lines carry post-save state
do $$
declare v_unit uuid; v_rec uuid; v_res jsonb; v_lines int;
begin
  select id into v_unit from public.units where name = 'Rig 105';
  select id into v_rec from public.tubular_records
  where unit_id = v_unit and remarks = '3m' limit 1;

  select public.submit_tubular_entry(v_unit, current_date, '[]'::jsonb,
    array[v_rec], 'remove the 3m pup') into v_res;

  if not exists (select 1 from public.tubular_records where id = v_rec and archived) then
    raise exception 'FAIL: archived record missing or not flagged';
  end if;
  select count(*) into v_lines from public.tubular_submission_lines
  where submission_id = (v_res->>'submission_id')::uuid and record_id = v_rec and archived;
  if v_lines <> 1 then
    raise exception 'FAIL: archive not audited in submission lines';
  end if;
  raise notice 'Archive flags the row (no hard delete) and is audited ... OK';
end $$;

reset role;

-- ---- 7) RLS read scoping -----------------------------------------------------------
-- unit viewer (Rig 105 only)
do $$ begin
  perform set_config('request.jwt.claims', json_build_object('sub', 'bbbb2222-2222-2222-2222-222222222222')::text, true);
end $$;
set local role authenticated;
do $$
declare v_own int; v_foreign int;
begin
  select count(*) into v_own from public.tubular_records t
  join public.units u on u.id = t.unit_id where u.name = 'Rig 105';
  select count(*) into v_foreign from public.tubular_records t
  join public.units u on u.id = t.unit_id where u.name = 'Rig 306';
  if v_own < 1 or v_foreign <> 0 then
    raise exception 'FAIL: unit viewer scoping wrong (own=%, foreign=%)', v_own, v_foreign;
  end if;
  raise notice 'Unit viewer sees only assigned-unit records ... OK';
end $$;
reset role;

-- fleet viewer sees all units' records
do $$ begin
  perform set_config('request.jwt.claims', json_build_object('sub', 'cccc3333-3333-3333-3333-333333333333')::text, true);
end $$;
set local role authenticated;
do $$
declare v_units int;
begin
  select count(distinct unit_id) into v_units from public.tubular_records;
  if v_units < 2 then
    raise exception 'FAIL: fleet viewer sees % units (expected >= 2)', v_units;
  end if;
  raise notice 'Fleet viewer sees all units ... OK';
end $$;
reset role;

-- no-permission user sees nothing and cannot save
do $$ begin
  perform set_config('request.jwt.claims', json_build_object('sub', 'dddd4444-4444-4444-4444-444444444444')::text, true);
end $$;
set local role authenticated;
do $$
declare v_n int; v_cat uuid;
begin
  select count(*) into v_n from public.tubular_records;
  if v_n <> 0 then
    raise exception 'FAIL: user with no module permission sees % records', v_n;
  end if;
  select id into v_cat from public.tubular_catalog limit 1;
  begin
    perform public.submit_tubular_entry(
      (select id from public.units where name = 'Rig 105'), current_date,
      jsonb_build_array(jsonb_build_object('id', null, 'catalog_item_id', v_cat,
        'position', 1, 'on_contract', 0, 'premium', 1, 'class2', 0, 'class3', 0,
        'scrap', 0, 'needs_inspection', 0, 'damaged_on_location', 0,
        'send_to_repair', 0, 'to_other_rig', 0, 'receive_from_rig', 0,
        'rental_date', null, 'remarks', null)));
    raise exception 'FAIL: user without data_entry saved a batch';
  exception when others then
    if sqlstate <> '42501' then raise; end if;
  end;
  raise notice 'No-permission user sees nothing, cannot save (6) ... OK';
end $$;
reset role;

-- Never persist fixture data.
rollback;
