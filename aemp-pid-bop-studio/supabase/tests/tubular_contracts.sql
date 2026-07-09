-- ============================================================================
--  tubular_contracts.sql — regression test for 0019_tubular_contracts.
--  Asserts: manage_contracts gates writes; unit-scoped reads; draft-only hard
--  delete; expired contracts' lines immutable. Requires migrations 0001-0019.
-- ============================================================================

begin;

insert into auth.users (id, email) values
  ('11ee11ee-1111-1111-1111-111111111111', 'contracts-c@test.local'),
  ('22ff22ff-2222-2222-2222-222222222222', 'viewer-c2@test.local'),
  ('33aa33aa-3333-3333-3333-333333333333', 'manager-c2@test.local')
on conflict (id) do nothing;

insert into public.profiles (id, email, role, rig) values
  ('11ee11ee-1111-1111-1111-111111111111', 'contracts-c@test.local', 'field',   null),
  ('22ff22ff-2222-2222-2222-222222222222', 'viewer-c2@test.local',   'field',   null),
  ('33aa33aa-3333-3333-3333-333333333333', 'manager-c2@test.local',  'manager', null)
on conflict (id) do update set role = excluded.role, rig = excluded.rig;

do $$ begin
  perform set_config('request.jwt.claims', json_build_object('sub', '33aa33aa-3333-3333-3333-333333333333')::text, true);
end $$;
set local role authenticated;
do $$ begin
  perform public.set_user_permissions('11ee11ee-1111-1111-1111-111111111111', array['view_fleet','manage_contracts']);
  perform public.set_user_permissions('22ff22ff-2222-2222-2222-222222222222', array['view']);
  perform public.set_user_units('22ff22ff-2222-2222-2222-222222222222', array[(select id from public.units where name = 'Rig 110')]);
end $$;
reset role;

-- ---- as contracts manager ----------------------------------------------------------
do $$ begin
  perform set_config('request.jwt.claims', json_build_object('sub', '11ee11ee-1111-1111-1111-111111111111')::text, true);
end $$;
set local role authenticated;

do $$
declare v_c uuid; v_line uuid;
begin
  insert into public.tubular_contracts (unit_id, client, contract_ref, start_date, end_date, status)
  values ((select id from public.units where name = 'Rig 110'), 'PDO', 'AB/2019-053', '2019-06-01', '2027-06-01', 'active')
  returning id into v_c;
  perform set_config('test.contract', v_c::text, true);

  insert into public.tubular_contract_lines (contract_id, catalog_item_id, quantity)
  values (v_c, (select id from public.tubular_catalog where description = '5" DP, G-105, 19.5 ppf, NC50'), 201)
  returning id into v_line;

  -- draft-only delete: an ACTIVE contract must not be hard-deletable
  delete from public.tubular_contracts where id = v_c;
  if not exists (select 1 from public.tubular_contracts where id = v_c) then
    raise exception 'FAIL: active contract was hard-deleted';
  end if;
  raise notice 'Contract + line created; active contract cannot be deleted ... OK';
end $$;

-- expired contract lines immutable
do $$
begin
  update public.tubular_contracts set status = 'expired'
  where id = current_setting('test.contract', true)::uuid;
  begin
    delete from public.tubular_contract_lines
    where contract_id = current_setting('test.contract', true)::uuid;
    if exists (select 1 from public.tubular_contract_lines
               where contract_id = current_setting('test.contract', true)::uuid) then
      raise notice 'Expired contract lines untouched by delete ... OK';
    else
      raise exception 'FAIL: expired contract lines were deleted';
    end if;
  end;
  -- reactivate for the viewer test below
  update public.tubular_contracts set status = 'active'
  where id = current_setting('test.contract', true)::uuid;
end $$;
reset role;

-- ---- viewer (Rig 110 view only) -----------------------------------------------------
do $$ begin
  perform set_config('request.jwt.claims', json_build_object('sub', '22ff22ff-2222-2222-2222-222222222222')::text, true);
end $$;
set local role authenticated;
do $$
declare v_n int;
begin
  select count(*) into v_n from public.tubular_contracts
  where id = current_setting('test.contract', true)::uuid;
  if v_n <> 1 then
    raise exception 'FAIL: assigned-unit viewer cannot read the unit contract';
  end if;
  begin
    update public.tubular_contracts set client = 'HACKED'
    where id = current_setting('test.contract', true)::uuid;
    if exists (select 1 from public.tubular_contracts where client = 'HACKED') then
      raise exception 'FAIL: viewer updated a contract';
    end if;
  exception when others then
    if sqlstate <> '42501' then raise; end if;
  end;
  begin
    insert into public.tubular_contracts (unit_id, contract_ref)
    values ((select id from public.units where name = 'Rig 110'), 'X');
    raise exception 'FAIL: viewer inserted a contract';
  exception when others then
    if sqlstate <> '42501' then raise; end if;
  end;
  raise notice 'Viewer reads unit contract, cannot write ... OK';
end $$;
reset role;

rollback;
