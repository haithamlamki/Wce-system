-- ============================================================================
--  tubular_notifications.sql — regression test for 0021_tubular_notifications.
--  Asserts: order request notifies approvers (not the actor); stage changes
--  notify the requester; transfers notify receiving-unit data_entry users;
--  RLS shows each user only their own rows and lets them mark read.
--  Requires migrations 0001-0021.
-- ============================================================================

begin;

insert into auth.users (id, email) values
  ('bbbb0001-0000-0000-0000-000000000001', 'requester-n@test.local'),
  ('bbbb0002-0000-0000-0000-000000000002', 'approver-n@test.local'),
  ('bbbb0003-0000-0000-0000-000000000003', 'receiver-n@test.local'),
  ('bbbb0004-0000-0000-0000-000000000004', 'manager-n@test.local')
on conflict (id) do nothing;

insert into public.profiles (id, email, role, rig) values
  ('bbbb0001-0000-0000-0000-000000000001', 'requester-n@test.local', 'field',   null),
  ('bbbb0002-0000-0000-0000-000000000002', 'approver-n@test.local',  'field',   null),
  ('bbbb0003-0000-0000-0000-000000000003', 'receiver-n@test.local',  'field',   null),
  ('bbbb0004-0000-0000-0000-000000000004', 'manager-n@test.local',   'manager', null)
on conflict (id) do update set role = excluded.role, rig = excluded.rig;

do $$ begin
  perform set_config('request.jwt.claims', json_build_object('sub', 'bbbb0004-0000-0000-0000-000000000004')::text, true);
end $$;
set local role authenticated;
do $$
declare v jsonb;
begin
  perform public.set_user_permissions('bbbb0001-0000-0000-0000-000000000001', array['view','data_entry']);
  perform public.set_user_units('bbbb0001-0000-0000-0000-000000000001', array[(select id from public.units where name = 'Rig 201')]);
  perform public.set_user_permissions('bbbb0002-0000-0000-0000-000000000002', array['view_fleet','approve_orders']);
  perform public.set_user_permissions('bbbb0003-0000-0000-0000-000000000003', array['view','data_entry']);
  perform public.set_user_units('bbbb0003-0000-0000-0000-000000000003', array[(select id from public.units where name = 'Rig 202')]);

  -- Rig 201 stock: the requester's own record (used for the transfer test)
  select public.submit_tubular_entry(
    (select id from public.units where name = 'Rig 201'), current_date,
    jsonb_build_array(jsonb_build_object('id', null,
      'catalog_item_id', (select id from public.tubular_catalog where description = '5" HWDP, NC50, 49.3 ppf'),
      'position', 21, 'on_contract', 0, 'premium', 30, 'class2', 0, 'class3', 0,
      'scrap', 0, 'needs_inspection', 0, 'damaged_on_location', 0,
      'send_to_repair', 0, 'to_other_rig', 0, 'receive_from_rig', 0,
      'rental_date', null, 'remarks', null))) into v;
  perform set_config('test.rec', v->'record_ids'->>0, true);

  -- Rig 203 stock: the order's source (must be a different unit than the requester's)
  select public.submit_tubular_entry(
    (select id from public.units where name = 'Rig 203'), current_date,
    jsonb_build_array(jsonb_build_object('id', null,
      'catalog_item_id', (select id from public.tubular_catalog where description = '5" HWDP, NC50, 49.3 ppf'),
      'position', 21, 'on_contract', 0, 'premium', 30, 'class2', 0, 'class3', 0,
      'scrap', 0, 'needs_inspection', 0, 'damaged_on_location', 0,
      'send_to_repair', 0, 'to_other_rig', 0, 'receive_from_rig', 0,
      'rental_date', null, 'remarks', null))) into v;
  perform set_config('test.src', v->'record_ids'->>0, true);
end $$;
reset role;

-- requester creates an order → approver notified
do $$ begin
  perform set_config('request.jwt.claims', json_build_object('sub', 'bbbb0001-0000-0000-0000-000000000001')::text, true);
end $$;
set local role authenticated;
do $$
declare v_order uuid;
begin
  v_order := public.create_pipe_order(
    (select id from public.units where name = 'Rig 201'),
    jsonb_build_array(jsonb_build_object(
      'catalog_item_id', (select id from public.tubular_catalog where description = '5" HWDP, NC50, 49.3 ppf'),
      'quantity', 5)));
  perform set_config('test.order', v_order::text, true);

  -- transfer to Rig 202 → receiver notified
  perform public.transfer_tubular(current_setting('test.rec', true)::uuid,
    (select id from public.units where name = 'Rig 202'), 3, null);

  -- RLS: requester sees no notifications yet (they were the actor everywhere)
  if exists (select 1 from public.notifications) then
    raise exception 'FAIL: actor received their own notifications';
  end if;
  raise notice 'Actor gets no self-notifications; RLS hides others ... OK';
end $$;
reset role;

-- approver sees the order_requested notification and can mark it read
do $$ begin
  perform set_config('request.jwt.claims', json_build_object('sub', 'bbbb0002-0000-0000-0000-000000000002')::text, true);
end $$;
set local role authenticated;
do $$
declare v_n int;
begin
  select count(*) into v_n from public.notifications where kind = 'order_requested';
  if v_n <> 1 then raise exception 'FAIL: approver has % order_requested notifications (expected 1)', v_n; end if;
  update public.notifications set read_at = clock_timestamp() where kind = 'order_requested';
  if exists (select 1 from public.notifications where kind = 'order_requested' and read_at is null) then
    raise exception 'FAIL: mark-read did not stick';
  end if;
  -- approve → requester notified
  perform public.approve_pipe_order(current_setting('test.order', true)::uuid,
    (select jsonb_build_array(jsonb_build_object('order_item_id', i.id,
      'record_id', current_setting('test.src', true)::uuid, 'quantity', 5))
     from public.pipe_order_items i
     where i.order_id = current_setting('test.order', true)::uuid));
  raise notice 'Approver notified of request, marks read, approves ... OK';
end $$;
reset role;

-- receiver sees the incoming-transfer notification
do $$ begin
  perform set_config('request.jwt.claims', json_build_object('sub', 'bbbb0003-0000-0000-0000-000000000003')::text, true);
end $$;
set local role authenticated;
do $$
declare v_n int;
begin
  select count(*) into v_n from public.notifications where kind = 'transfer_incoming';
  if v_n <> 1 then raise exception 'FAIL: receiver has % transfer notifications (expected 1)', v_n; end if;
  raise notice 'Receiving unit notified of incoming transfer ... OK';
end $$;
reset role;

-- requester sees the order_approved notification (and only their own rows)
do $$ begin
  perform set_config('request.jwt.claims', json_build_object('sub', 'bbbb0001-0000-0000-0000-000000000001')::text, true);
end $$;
set local role authenticated;
do $$
declare v_n int; v_foreign int;
begin
  select count(*) into v_n from public.notifications where kind = 'order_approved';
  select count(*) into v_foreign from public.notifications where kind in ('order_requested', 'transfer_incoming');
  if v_n <> 1 or v_foreign <> 0 then
    raise exception 'FAIL: requester notification scope wrong (approved=%, foreign=%)', v_n, v_foreign;
  end if;
  raise notice 'Requester notified on approval; sees only own rows ... OK';
end $$;
reset role;

rollback;
