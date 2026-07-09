-- ============================================================================
--  tubular_movements.sql — regression test for 0018_tubular_movements.
--
--  Asserts:
--    1. A data_entry user on the source unit can create a pending transfer;
--       the source's to_other_rig is committed; premium untouched until receipt.
--    2. Over-commitment is rejected (quantity + pending > premium → 23514).
--    3. A user with no rights on source or destination cannot create/complete.
--    4. The receiving unit's data_entry user completes the movement: ONE
--       transaction moves premium source→destination (destination record
--       auto-created), adjusts to_other_rig/receive_from_rig, writes movement
--       submissions for BOTH units.
--    5. cancel_movement releases the commitment; completed movements cannot
--       be cancelled or re-completed (immutable history).
--
--  Conventions as cloud_rpcs.sql. Requires migrations 0001-0018.
-- ============================================================================

begin;

insert into auth.users (id, email) values
  ('aa11aa11-aaaa-1111-aaaa-111111111111', 'sender-m@test.local'),
  ('bb22bb22-bbbb-2222-bbbb-222222222222', 'receiver-m@test.local'),
  ('cc33cc33-cccc-3333-cccc-333333333333', 'outsider-m@test.local'),
  ('dd44dd44-dddd-4444-dddd-444444444444', 'manager-m@test.local')
on conflict (id) do nothing;

insert into public.profiles (id, email, role, rig) values
  ('aa11aa11-aaaa-1111-aaaa-111111111111', 'sender-m@test.local',   'field',   null),
  ('bb22bb22-bbbb-2222-bbbb-222222222222', 'receiver-m@test.local', 'field',   null),
  ('cc33cc33-cccc-3333-cccc-333333333333', 'outsider-m@test.local', 'field',   null),
  ('dd44dd44-dddd-4444-dddd-444444444444', 'manager-m@test.local',  'manager', null)
on conflict (id) do update set role = excluded.role, rig = excluded.rig;

-- grants + a source record on Rig 305 (premium 20)
do $$ begin
  perform set_config('request.jwt.claims', json_build_object('sub', 'dd44dd44-dddd-4444-dddd-444444444444')::text, true);
end $$;
set local role authenticated;
do $$
declare v jsonb;
begin
  perform public.set_user_permissions('aa11aa11-aaaa-1111-aaaa-111111111111', array['view','data_entry']);
  perform public.set_user_units('aa11aa11-aaaa-1111-aaaa-111111111111', array[(select id from public.units where name = 'Rig 305')]);
  perform public.set_user_permissions('bb22bb22-bbbb-2222-bbbb-222222222222', array['view','data_entry']);
  perform public.set_user_units('bb22bb22-bbbb-2222-bbbb-222222222222', array[(select id from public.units where name = 'Rig 306')]);
  perform public.set_user_permissions('cc33cc33-cccc-3333-cccc-333333333333', array['view']);

  select public.submit_tubular_entry(
    (select id from public.units where name = 'Rig 305'), current_date,
    jsonb_build_array(jsonb_build_object('id', null,
      'catalog_item_id', (select id from public.tubular_catalog where description = '4" HWDP, XT39, 30.5 ppf'),
      'position', 21, 'on_contract', 30, 'premium', 20, 'class2', 0, 'class3', 0,
      'scrap', 0, 'needs_inspection', 0, 'damaged_on_location', 0,
      'send_to_repair', 0, 'to_other_rig', 0, 'receive_from_rig', 0,
      'rental_date', null, 'remarks', null))) into v;
  perform set_config('test.src_record', v->'record_ids'->>0, true);
end $$;
reset role;

-- ---- as sender -------------------------------------------------------------------
do $$ begin
  perform set_config('request.jwt.claims', json_build_object('sub', 'aa11aa11-aaaa-1111-aaaa-111111111111')::text, true);
end $$;
set local role authenticated;

-- 1) create pending transfer of 8 to Rig 306
do $$
declare v_mv uuid; v_rec public.tubular_records%rowtype;
begin
  v_mv := public.transfer_tubular(
    current_setting('test.src_record', true)::uuid,
    (select id from public.units where name = 'Rig 306'), 8, 'BHA change-out');
  perform set_config('test.movement', v_mv::text, true);
  select * into v_rec from public.tubular_records where id = current_setting('test.src_record', true)::uuid;
  if v_rec.premium <> 20 or v_rec.to_other_rig <> 8 then
    raise exception 'FAIL: pending transfer wrong (premium=%, to_other_rig=%)', v_rec.premium, v_rec.to_other_rig;
  end if;
  raise notice 'Pending transfer commits to_other_rig, leaves premium ... OK';
end $$;

-- 2) over-commit rejected (8 pending + 15 > 20)
do $$
begin
  begin
    perform public.transfer_tubular(
      current_setting('test.src_record', true)::uuid,
      (select id from public.units where name = 'Rig 306'), 15, null);
    raise exception 'FAIL: over-commitment accepted';
  exception when others then
    if sqlstate <> '23514' then raise; end if;
  end;
  raise notice 'Over-commitment beyond premium rejected ... OK';
end $$;

-- sender cannot complete (not receiver, no approve_movements)
do $$
begin
  begin
    perform public.complete_movement(current_setting('test.movement', true)::uuid);
    raise exception 'FAIL: sender completed the movement';
  exception when others then
    if sqlstate <> '42501' then raise; end if;
  end;
  raise notice 'Sender cannot self-complete ... OK';
end $$;
reset role;

-- 3) outsider cannot create or complete
do $$ begin
  perform set_config('request.jwt.claims', json_build_object('sub', 'cc33cc33-cccc-3333-cccc-333333333333')::text, true);
end $$;
set local role authenticated;
do $$
begin
  begin
    perform public.transfer_tubular(current_setting('test.src_record', true)::uuid,
      (select id from public.units where name = 'Rig 306'), 1, null);
    raise exception 'FAIL: outsider created a transfer';
  exception when others then
    if sqlstate <> '42501' then raise; end if;
  end;
  begin
    perform public.complete_movement(current_setting('test.movement', true)::uuid);
    raise exception 'FAIL: outsider completed a movement';
  exception when others then
    if sqlstate <> '42501' then raise; end if;
  end;
  raise notice 'Outsider denied on create/complete ... OK';
end $$;
reset role;

-- ---- as receiver (Rig 306 data_entry) ------------------------------------------------
do $$ begin
  perform set_config('request.jwt.claims', json_build_object('sub', 'bb22bb22-bbbb-2222-bbbb-222222222222')::text, true);
end $$;
set local role authenticated;

-- 4) complete: atomic move + both-side audit
do $$
declare
  v_src public.tubular_records%rowtype;
  v_dest public.tubular_records%rowtype;
  v_subs int;
begin
  perform public.complete_movement(current_setting('test.movement', true)::uuid);
  select * into v_src from public.tubular_records where id = current_setting('test.src_record', true)::uuid;
  if v_src.premium <> 12 or v_src.to_other_rig <> 0 then
    raise exception 'FAIL: source after completion (premium=%, to_other_rig=%)', v_src.premium, v_src.to_other_rig;
  end if;
  select t.* into v_dest from public.tubular_records t
  join public.units u on u.id = t.unit_id
  join public.tubular_catalog c on c.id = t.catalog_item_id
  where u.name = 'Rig 306' and c.description = '4" HWDP, XT39, 30.5 ppf';
  if v_dest.id is null or v_dest.premium <> 8 or v_dest.receive_from_rig <> 8 then
    raise exception 'FAIL: destination after completion (premium=%, receive=%)', v_dest.premium, v_dest.receive_from_rig;
  end if;
  -- RLS check built in: the receiver sees ONLY the destination-unit submission
  select count(*) into v_subs from public.tubular_submissions where source = 'movement';
  if v_subs <> 1 then
    raise exception 'FAIL: receiver should see exactly the destination movement submission (saw %)', v_subs;
  end if;
  raise notice 'Completion moves premium atomically; receiver sees dest audit only ... OK';
end $$;

-- 5) completed movements are immutable
do $$
begin
  begin
    perform public.complete_movement(current_setting('test.movement', true)::uuid);
    raise exception 'FAIL: completed movement re-completed';
  exception when others then
    if sqlstate <> '22023' then raise; end if;
  end;
  begin
    perform public.cancel_movement(current_setting('test.movement', true)::uuid);
    raise exception 'FAIL: completed movement cancelled';
  exception when others then
    if sqlstate <> '22023' then raise; end if;
  end;
  raise notice 'Completed movements are immutable ... OK';
end $$;
reset role;

-- cancel path: new pending transfer, then cancel releases the commitment
do $$ begin
  perform set_config('request.jwt.claims', json_build_object('sub', 'aa11aa11-aaaa-1111-aaaa-111111111111')::text, true);
end $$;
set local role authenticated;
do $$
declare v_mv uuid; v_rec public.tubular_records%rowtype;
begin
  v_mv := public.transfer_tubular(
    current_setting('test.src_record', true)::uuid,
    (select id from public.units where name = 'Rig 306'), 5, null);
  perform public.cancel_movement(v_mv);
  select * into v_rec from public.tubular_records where id = current_setting('test.src_record', true)::uuid;
  if v_rec.premium <> 12 or v_rec.to_other_rig <> 0 then
    raise exception 'FAIL: cancel did not release (premium=%, to_other_rig=%)', v_rec.premium, v_rec.to_other_rig;
  end if;
  raise notice 'Cancel releases the pending commitment ... OK';
end $$;
reset role;

-- both-side audit trail, seen with fleet-wide eyes (manager)
do $$ begin
  perform set_config('request.jwt.claims', json_build_object('sub', 'dd44dd44-dddd-4444-dddd-444444444444')::text, true);
end $$;
set local role authenticated;
do $$
declare v_subs int;
begin
  select count(*) into v_subs from public.tubular_submissions where source = 'movement';
  if v_subs < 4 then -- initiate + complete(src) + receive(dest) + cancel(src)
    raise exception 'FAIL: expected >=4 movement submissions fleet-wide, saw %', v_subs;
  end if;
  raise notice 'Movement audit submissions exist for both units (fleet view) ... OK';
end $$;
reset role;

rollback;
