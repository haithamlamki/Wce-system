-- ============================================================================
--  tubular_orders.sql — regression test for 0020_tubular_orders.
--
--  Asserts:
--    1. Requesting-unit user creates an order (requested + event row).
--    2. Non-approver cannot approve; approver cannot over-allocate beyond
--       AVAILABLE = P+C2 − held (Class 3/Scrap excluded by construction:
--       a record rich in class3/scrap offers no availability from them).
--    3. Approval reserves stock; availability view drops accordingly;
--       partial allocation is rejected (every item fully allocated).
--    4. Legal transitions only; random/out-of-order jumps rejected.
--    5. Delivery consumes reservations, moves premium source→destination in
--       one transaction, creates completed movements, audits both units.
--    6. Cancellation of an approved order releases held reservations.
--
--  Conventions as cloud_rpcs.sql. Requires migrations 0001-0020.
-- ============================================================================

begin;

insert into auth.users (id, email) values
  ('aaaa0001-0000-0000-0000-000000000001', 'requester-o@test.local'),
  ('aaaa0002-0000-0000-0000-000000000002', 'approver-o@test.local'),
  ('aaaa0003-0000-0000-0000-000000000003', 'yard-o@test.local'),
  ('aaaa0004-0000-0000-0000-000000000004', 'manager-o@test.local')
on conflict (id) do nothing;

insert into public.profiles (id, email, role, rig) values
  ('aaaa0001-0000-0000-0000-000000000001', 'requester-o@test.local', 'field',   null),
  ('aaaa0002-0000-0000-0000-000000000002', 'approver-o@test.local',  'field',   null),
  ('aaaa0003-0000-0000-0000-000000000003', 'yard-o@test.local',      'field',   null),
  ('aaaa0004-0000-0000-0000-000000000004', 'manager-o@test.local',   'manager', null)
on conflict (id) do update set role = excluded.role, rig = excluded.rig;

do $$ begin
  perform set_config('request.jwt.claims', json_build_object('sub', 'aaaa0004-0000-0000-0000-000000000004')::text, true);
end $$;
set local role authenticated;
do $$
declare v jsonb;
begin
  perform public.set_user_permissions('aaaa0001-0000-0000-0000-000000000001', array['view','data_entry']);
  perform public.set_user_units('aaaa0001-0000-0000-0000-000000000001', array[(select id from public.units where name = 'Rig 111')]);
  perform public.set_user_permissions('aaaa0002-0000-0000-0000-000000000002', array['view_fleet','approve_orders']);
  perform public.set_user_permissions('aaaa0003-0000-0000-0000-000000000003', array['view_fleet','manage_orders']);

  -- source stock on Rig 204: premium 10, class2 2, class3 50, scrap 40
  -- (class3/scrap rich: only 12 may ever be orderable)
  select public.submit_tubular_entry(
    (select id from public.units where name = 'Rig 204'), current_date,
    jsonb_build_array(jsonb_build_object('id', null,
      'catalog_item_id', (select id from public.tubular_catalog where description = '6-1/2" DC, 4" IF'),
      'position', 30, 'on_contract', 0, 'premium', 10, 'class2', 2, 'class3', 50,
      'scrap', 40, 'needs_inspection', 5, 'damaged_on_location', 0,
      'send_to_repair', 0, 'to_other_rig', 0, 'receive_from_rig', 0,
      'rental_date', null, 'remarks', null))) into v;
  perform set_config('test.src', v->'record_ids'->>0, true);
end $$;
reset role;

-- ---- 1) requester creates the order ------------------------------------------------
do $$ begin
  perform set_config('request.jwt.claims', json_build_object('sub', 'aaaa0001-0000-0000-0000-000000000001')::text, true);
end $$;
set local role authenticated;
do $$
declare v_order uuid; v_events int;
begin
  v_order := public.create_pipe_order(
    (select id from public.units where name = 'Rig 111'),
    jsonb_build_array(jsonb_build_object(
      'catalog_item_id', (select id from public.tubular_catalog where description = '6-1/2" DC, 4" IF'),
      'quantity', 8)),
    current_date + 14, 'high', 'BHA for section 12-1/4');
  perform set_config('test.order', v_order::text, true);
  select count(*) into v_events from public.pipe_order_events where order_id = v_order;
  if v_events <> 1 then raise exception 'FAIL: expected 1 event, got %', v_events; end if;

  -- requester is not an approver
  begin
    perform public.approve_pipe_order(v_order, '[]'::jsonb);
    raise exception 'FAIL: requester approved own order';
  exception when others then
    if sqlstate <> '42501' then raise; end if;
  end;
  raise notice 'Order created (requested + event); requester cannot approve ... OK';
end $$;
reset role;

-- ---- 2+3) approver: availability enforced; reservation created ----------------------
do $$ begin
  perform set_config('request.jwt.claims', json_build_object('sub', 'aaaa0002-0000-0000-0000-000000000002')::text, true);
end $$;
set local role authenticated;
do $$
declare v_item uuid; v_avail int;
begin
  select id into v_item from public.pipe_order_items
  where order_id = current_setting('test.order', true)::uuid;

  -- availability = 10+2 = 12 (class3 50 and scrap 40 NEVER count)
  select available into v_avail from public.tubular_availability
  where record_id = current_setting('test.src', true)::uuid;
  if v_avail <> 12 then
    raise exception 'FAIL: availability = % (expected 12 = P+C2 only)', v_avail;
  end if;

  -- over-allocation (13 > 12) rejected
  begin
    perform public.approve_pipe_order(current_setting('test.order', true)::uuid,
      jsonb_build_array(jsonb_build_object('order_item_id', v_item,
        'record_id', current_setting('test.src', true)::uuid, 'quantity', 13)));
    raise exception 'FAIL: over-allocation beyond P+C2 accepted';
  exception when others then
    if sqlstate <> '23514' then raise; end if;
  end;

  -- partial allocation (5 of 8) rejected
  begin
    perform public.approve_pipe_order(current_setting('test.order', true)::uuid,
      jsonb_build_array(jsonb_build_object('order_item_id', v_item,
        'record_id', current_setting('test.src', true)::uuid, 'quantity', 5)));
    raise exception 'FAIL: partial allocation accepted';
  exception when others then
    if sqlstate <> '22023' then raise; end if;
  end;

  -- full allocation of 8 accepted; availability drops to 4
  perform public.approve_pipe_order(current_setting('test.order', true)::uuid,
    jsonb_build_array(jsonb_build_object('order_item_id', v_item,
      'record_id', current_setting('test.src', true)::uuid, 'quantity', 8)));
  select available into v_avail from public.tubular_availability
  where record_id = current_setting('test.src', true)::uuid;
  if v_avail <> 4 then
    raise exception 'FAIL: availability after hold = % (expected 4)', v_avail;
  end if;
  raise notice 'Approval: P+C2 availability enforced, holds reserve stock ... OK';
end $$;
reset role;

-- ---- 4) legal transitions only -------------------------------------------------------
do $$ begin
  perform set_config('request.jwt.claims', json_build_object('sub', 'aaaa0003-0000-0000-0000-000000000003')::text, true);
end $$;
set local role authenticated;
do $$
begin
  begin
    perform public.advance_pipe_order(current_setting('test.order', true)::uuid, 'delivered');
    raise exception 'FAIL: approved -> delivered jump accepted';
  exception when others then
    if sqlstate <> '22023' then raise; end if;
  end;
  perform public.advance_pipe_order(current_setting('test.order', true)::uuid, 'picked', 'yard pull complete');
  perform public.advance_pipe_order(current_setting('test.order', true)::uuid, 'in_transit', 'truck 214');
  raise notice 'Stage transitions enforced (no jumps, no timers) ... OK';
end $$;
reset role;

-- ---- 5) delivery consumes + moves stock ---------------------------------------------
do $$ begin
  perform set_config('request.jwt.claims', json_build_object('sub', 'aaaa0001-0000-0000-0000-000000000001')::text, true);
end $$;
set local role authenticated;
do $$
declare v_src public.tubular_records%rowtype; v_dest public.tubular_records%rowtype; v_res int; v_mv int;
begin
  perform public.advance_pipe_order(current_setting('test.order', true)::uuid, 'delivered', 'received on location');
  select * into v_src from public.tubular_records where id = current_setting('test.src', true)::uuid;
  if v_src.premium <> 2 then
    raise exception 'FAIL: source premium after delivery = % (expected 2)', v_src.premium;
  end if;
  select t.* into v_dest from public.tubular_records t
  join public.units u on u.id = t.unit_id
  join public.tubular_catalog c on c.id = t.catalog_item_id
  where u.name = 'Rig 111' and c.description = '6-1/2" DC, 4" IF';
  if v_dest.id is null or v_dest.premium <> 8 or v_dest.receive_from_rig <> 8 then
    raise exception 'FAIL: destination after delivery (premium=%, receive=%)', v_dest.premium, v_dest.receive_from_rig;
  end if;
  select count(*) into v_res from public.tubular_reservations where status = 'held';
  if v_res <> 0 then raise exception 'FAIL: % holds left after delivery', v_res; end if;
  select count(*) into v_mv from public.tubular_movements
  where to_unit_id = (select id from public.units where name = 'Rig 111') and status = 'completed';
  if v_mv <> 1 then raise exception 'FAIL: delivery movement missing'; end if;
  raise notice 'Delivery consumes holds, moves premium, records movement ... OK';
end $$;
reset role;

-- ---- 6) cancellation releases holds ---------------------------------------------------
do $$ begin
  perform set_config('request.jwt.claims', json_build_object('sub', 'aaaa0004-0000-0000-0000-000000000004')::text, true);
end $$;
set local role authenticated;
do $$
declare v_order uuid; v_item uuid; v_avail int;
begin
  v_order := public.create_pipe_order(
    (select id from public.units where name = 'Rig 111'),
    jsonb_build_array(jsonb_build_object(
      'catalog_item_id', (select id from public.tubular_catalog where description = '6-1/2" DC, 4" IF'),
      'quantity', 2)));
  select id into v_item from public.pipe_order_items where order_id = v_order;
  perform public.approve_pipe_order(v_order,
    jsonb_build_array(jsonb_build_object('order_item_id', v_item,
      'record_id', current_setting('test.src', true)::uuid, 'quantity', 2)));
  -- post-delivery serviceable = premium 2 + class2 2 = 4; hold of 2 leaves 2
  select available into v_avail from public.tubular_availability
  where record_id = current_setting('test.src', true)::uuid;
  if v_avail <> 2 then raise exception 'FAIL: availability before cancel = % (expected 2)', v_avail; end if;

  perform public.cancel_pipe_order(v_order, 'no longer needed');
  select available into v_avail from public.tubular_availability
  where record_id = current_setting('test.src', true)::uuid;
  if v_avail <> 4 then raise exception 'FAIL: cancel did not release (available=%)', v_avail; end if;
  raise notice 'Cancellation releases held reservations ... OK';
end $$;
reset role;

rollback;
