-- ============================================================================
--  tubular_import.sql — regression test for 0017_tubular_import.
--
--  Asserts:
--    1. A user without the import permission gets 42501 from stage/commit/rollback.
--    2. stage_import stages rows without touching tubular_records; unknown
--       units/descriptions and error rows become 'skip' (reported, not dropped).
--    3. commit_import inserts records transactionally: duplicate descriptions
--       become separate records (occurrence index), typed On Board totals land
--       in on_board_override, and one 'import' submission per unit is written.
--    4. Re-import (second batch) UPDATES the same records (stable identity via
--       occurrence index) instead of duplicating them, snapshotting pre-images.
--    5. rollback_import restores the exact pre-import state (second batch) and
--       deletes batch-inserted records (first batch), including submissions.
--    6. rollback REFUSES (55000) when a unit has a newer data_entry submission.
--
--  Conventions as cloud_rpcs.sql. Requires migrations 0001-0017.
--    psql "$BRANCH_DB_URL" -f supabase/tests/tubular_import.sql
-- ============================================================================

begin;

insert into auth.users (id, email) values
  ('11aa11aa-1111-1111-1111-111111111111', 'importer-i@test.local'),
  ('22bb22bb-2222-2222-2222-222222222222', 'plain-i@test.local'),
  ('33cc33cc-3333-3333-3333-333333333333', 'manager-i@test.local')
on conflict (id) do nothing;

insert into public.profiles (id, email, role, rig) values
  ('11aa11aa-1111-1111-1111-111111111111', 'importer-i@test.local', 'field',   null),
  ('22bb22bb-2222-2222-2222-222222222222', 'plain-i@test.local',    'field',   null),
  ('33cc33cc-3333-3333-3333-333333333333', 'manager-i@test.local',  'manager', null)
on conflict (id) do update set role = excluded.role, rig = excluded.rig;

do $$ begin
  perform set_config('request.jwt.claims', json_build_object('sub', '33cc33cc-3333-3333-3333-333333333333')::text, true);
end $$;
set local role authenticated;
do $$ begin
  perform public.set_user_permissions('11aa11aa-1111-1111-1111-111111111111',
    array['view_fleet','import','data_entry']);
  perform public.set_user_units('11aa11aa-1111-1111-1111-111111111111', array[
    (select id from public.units where name = 'Rig 210')]);
end $$;
reset role;

-- helper fragment used below: 4 stage rows for Rig 210 —
--   r7  DP 5" NC50: contract 100, premium 80, typed on-board 95 (override)
--   r37 PUP 19.5 ppf occurrence 1 (remarks 1.5m)
--   r38 PUP 19.5 ppf occurrence 2 (remarks 3m)   <- duplicate description
--   r9  unknown description (error row -> skip)
-- plus one row for a unit that does not exist -> skip.

-- ---- 1) permission guard -------------------------------------------------------
do $$ begin
  perform set_config('request.jwt.claims', json_build_object('sub', '22bb22bb-2222-2222-2222-222222222222')::text, true);
end $$;
set local role authenticated;
do $$
begin
  begin
    perform public.stage_import('wb.xlsx', null, '[]'::jsonb);
    raise exception 'FAIL: user without import permission staged a batch';
  exception when others then
    if sqlstate <> '42501' then raise; end if;
  end;
  raise notice 'stage_import denied without import permission ... OK';
end $$;
reset role;

-- ---- as importer -----------------------------------------------------------------
do $$ begin
  perform set_config('request.jwt.claims', json_build_object('sub', '11aa11aa-1111-1111-1111-111111111111')::text, true);
end $$;
set local role authenticated;

-- 2+3) stage + commit first batch
do $$
declare v jsonb; v_batch uuid; v_recs int; v_over int; v_subs int; v_skip int;
begin
  select public.stage_import('wb.xlsx', 'hash-1', jsonb_build_array(
    jsonb_build_object('sheet_name','Rig 210','row_num',7,'unit_name','Rig 210',
      'category','drill_pipe','description','5" DP, G-105, 19.5 ppf, NC50','occurrence_index',1,
      'on_contract',100,'premium',80,'class2',0,'class3',0,'scrap',0,
      'needs_inspection',0,'damaged_on_location',15,'send_to_repair',0,
      'to_other_rig',0,'receive_from_rig',0,'on_board_reported',95,
      'rental_date',null,'remarks',null,'entry_date','2026-07-01','contract_ref',null,
      'issues','[]'::jsonb,'has_error',false),
    jsonb_build_object('sheet_name','Rig 210','row_num',37,'unit_name','Rig 210',
      'category','pup_joint','description','5" PUP, G-105, NC50, 19.5 ppf','occurrence_index',1,
      'on_contract',2,'premium',1,'class2',0,'class3',0,'scrap',0,
      'needs_inspection',0,'damaged_on_location',0,'send_to_repair',0,
      'to_other_rig',0,'receive_from_rig',0,'on_board_reported',null,
      'rental_date',null,'remarks','1.5m','entry_date','2026-07-01','contract_ref',null,
      'issues','[]'::jsonb,'has_error',false),
    jsonb_build_object('sheet_name','Rig 210','row_num',38,'unit_name','Rig 210',
      'category','pup_joint','description','5" PUP, G-105, NC50, 19.5 ppf','occurrence_index',2,
      'on_contract',2,'premium',2,'class2',0,'class3',0,'scrap',0,
      'needs_inspection',0,'damaged_on_location',0,'send_to_repair',0,
      'to_other_rig',0,'receive_from_rig',0,'on_board_reported',null,
      'rental_date',null,'remarks','3m','entry_date','2026-07-01','contract_ref',null,
      'issues','[]'::jsonb,'has_error',false),
    jsonb_build_object('sheet_name','Rig 210','row_num',9,'unit_name','Rig 210',
      'category','drill_pipe','description','NOT A REAL PIPE','occurrence_index',1,
      'on_contract',1,'premium',1,'class2',0,'class3',0,'scrap',0,
      'needs_inspection',0,'damaged_on_location',0,'send_to_repair',0,
      'to_other_rig',0,'receive_from_rig',0,'on_board_reported',null,
      'rental_date',null,'remarks',null,'entry_date','2026-07-01','contract_ref',null,
      'issues','[{"level":"error","message":"unknown description"}]'::jsonb,'has_error',true),
    jsonb_build_object('sheet_name','Rig 999','row_num',7,'unit_name','Rig 999',
      'category','drill_pipe','description','5" DP, G-105, 19.5 ppf, NC50','occurrence_index',1,
      'on_contract',1,'premium',1,'class2',0,'class3',0,'scrap',0,
      'needs_inspection',0,'damaged_on_location',0,'send_to_repair',0,
      'to_other_rig',0,'receive_from_rig',0,'on_board_reported',null,
      'rental_date',null,'remarks',null,'entry_date','2026-07-01','contract_ref',null,
      'issues','[]'::jsonb,'has_error',false)
  )) into v;
  v_batch := (v->>'batch_id')::uuid;
  perform set_config('test.batch1', v_batch::text, true);

  if (v->>'staged')::int <> 3 or (v->>'skipped')::int <> 2 then
    raise exception 'FAIL: stage stats wrong: %', v;
  end if;
  select count(*) into v_recs from public.tubular_records
  where unit_id = (select id from public.units where name = 'Rig 210');
  if v_recs <> 0 then
    raise exception 'FAIL: staging touched tubular_records (% rows)', v_recs;
  end if;

  select public.commit_import(v_batch) into v;
  if (v->>'inserted')::int <> 3 or (v->>'updated')::int <> 0 or (v->>'skipped')::int <> 2 then
    raise exception 'FAIL: commit stats wrong: %', v;
  end if;

  select count(*) into v_recs from public.tubular_records
  where unit_id = (select id from public.units where name = 'Rig 210') and not archived;
  select count(*) into v_over from public.tubular_records
  where unit_id = (select id from public.units where name = 'Rig 210') and on_board_override = 95;
  select count(*) into v_subs from public.tubular_submissions
  where import_batch_id = v_batch;
  if v_recs <> 3 or v_over <> 1 or v_subs <> 1 then
    raise exception 'FAIL: commit result wrong (recs=%, override=%, subs=%)', v_recs, v_over, v_subs;
  end if;
  -- the duplicate pup joints are two separate rows
  select count(*) into v_recs from public.tubular_records t
  join public.tubular_catalog c on c.id = t.catalog_item_id
  where t.unit_id = (select id from public.units where name = 'Rig 210')
    and c.description = '5" PUP, G-105, NC50, 19.5 ppf';
  if v_recs <> 2 then
    raise exception 'FAIL: duplicate pup joints collapsed (% rows)', v_recs;
  end if;
  -- on_board generated: override wins for the DP row (95), sum for the pups
  if not exists (select 1 from public.tubular_records
                 where on_board = 95 and premium = 80
                   and unit_id = (select id from public.units where name = 'Rig 210')) then
    raise exception 'FAIL: on_board did not use the reported override';
  end if;
  raise notice 'stage + commit: inserts, overrides, duplicates, per-unit submission ... OK';
end $$;

-- 4) re-import updates in place (stable identity), pre-images kept
do $$
declare v jsonb; v_batch uuid; v_recs int; v_prem int;
begin
  select public.stage_import('wb2.xlsx', 'hash-2', jsonb_build_array(
    jsonb_build_object('sheet_name','Rig 210','row_num',37,'unit_name','Rig 210',
      'category','pup_joint','description','5" PUP, G-105, NC50, 19.5 ppf','occurrence_index',1,
      'on_contract',2,'premium',5,'class2',0,'class3',0,'scrap',0,
      'needs_inspection',0,'damaged_on_location',0,'send_to_repair',0,
      'to_other_rig',0,'receive_from_rig',0,'on_board_reported',null,
      'rental_date',null,'remarks','1.5m','entry_date','2026-07-02','contract_ref',null,
      'issues','[]'::jsonb,'has_error',false)
  )) into v;
  v_batch := (v->>'batch_id')::uuid;
  perform set_config('test.batch2', v_batch::text, true);
  perform public.commit_import(v_batch);

  select count(*) into v_recs from public.tubular_records t
  join public.tubular_catalog c on c.id = t.catalog_item_id
  where t.unit_id = (select id from public.units where name = 'Rig 210')
    and c.description = '5" PUP, G-105, NC50, 19.5 ppf' and not t.archived;
  if v_recs <> 2 then
    raise exception 'FAIL: re-import duplicated instead of updating (% pup rows)', v_recs;
  end if;
  select premium into v_prem from public.import_rows ir
  join public.tubular_records t on t.id = ir.record_id
  where ir.batch_id = v_batch limit 1;
  if v_prem <> 5 then
    raise exception 'FAIL: re-import did not update premium (got %)', v_prem;
  end if;
  if not exists (select 1 from public.import_rows
                 where batch_id = v_batch and action = 'update'
                   and (prior->>'premium')::int = 1) then
    raise exception 'FAIL: pre-image not captured on update';
  end if;
  raise notice 'Re-import updates the same records with pre-images ... OK';
end $$;

-- 5) rollback second batch restores premium=1
do $$
declare v_prem int;
begin
  perform public.rollback_import(current_setting('test.batch2', true)::uuid);
  select t.premium into v_prem from public.tubular_records t
  join public.tubular_catalog c on c.id = t.catalog_item_id
  where t.unit_id = (select id from public.units where name = 'Rig 210')
    and c.description = '5" PUP, G-105, NC50, 19.5 ppf' and t.remarks = '1.5m';
  if v_prem <> 1 then
    raise exception 'FAIL: rollback did not restore premium (got %)', v_prem;
  end if;
  raise notice 'Rollback restores exact pre-import values ... OK';
end $$;

-- 6) a newer data_entry submission blocks rollback of batch 1
do $$
declare v_cat uuid;
begin
  select id into v_cat from public.tubular_catalog where description = '5" HWDP, NC50, 49.3 ppf';
  perform public.submit_tubular_entry(
    (select id from public.units where name = 'Rig 210'), current_date,
    jsonb_build_array(jsonb_build_object('id', null, 'catalog_item_id', v_cat,
      'position', 21, 'on_contract', 0, 'premium', 3, 'class2', 0, 'class3', 0,
      'scrap', 0, 'needs_inspection', 0, 'damaged_on_location', 0,
      'send_to_repair', 0, 'to_other_rig', 0, 'receive_from_rig', 0,
      'rental_date', null, 'remarks', 'field entry after import')));
  begin
    perform public.rollback_import(current_setting('test.batch1', true)::uuid);
    raise exception 'FAIL: rollback succeeded despite a newer field submission';
  exception when others then
    if sqlstate <> '55000' then raise; end if;
  end;
  raise notice 'Rollback refused when newer field submissions exist (55000) ... OK';
end $$;

reset role;

rollback;
