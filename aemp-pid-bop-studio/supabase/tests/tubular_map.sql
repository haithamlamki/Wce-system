-- ============================================================================
--  tubular_map.sql — regression test for 0024_tubular_map.
--  Asserts: 37 seeded locations readable by any authenticated user; writes
--  privileged-only; planned_trips custom-destination constraint holds.
--  Requires migrations 0001-0024.
-- ============================================================================

begin;

insert into auth.users (id, email) values
  ('11aa22bb-1111-1111-1111-111111111111', 'field-map@test.local'),
  ('22bb33cc-2222-2222-2222-222222222222', 'manager-map@test.local')
on conflict (id) do nothing;

insert into public.profiles (id, email, role, rig) values
  ('11aa22bb-1111-1111-1111-111111111111', 'field-map@test.local',   'field',   null),
  ('22bb33cc-2222-2222-2222-222222222222', 'manager-map@test.local', 'manager', null)
on conflict (id) do update set role = excluded.role, rig = excluded.rig;

-- seed shape
do $$
declare v int;
begin
  select count(*) into v from public.map_locations;
  if v < 37 then raise exception 'FAIL: expected >=37 seeded locations, got %', v; end if;
  select count(*) into v from public.map_locations where category = 'logistics';
  if v < 8 then raise exception 'FAIL: logistics seed short (%)', v; end if;
  raise notice 'Map seed present (% locations) ... OK', v;
end $$;

-- field: read yes, write no
do $$ begin
  perform set_config('request.jwt.claims', json_build_object('sub', '11aa22bb-1111-1111-1111-111111111111')::text, true);
end $$;
set local role authenticated;
do $$
declare v int;
begin
  select count(*) into v from public.map_locations;
  if v < 37 then raise exception 'FAIL: field user cannot read locations'; end if;
  begin
    insert into public.map_locations (name, category, status, lat, lng)
    values ('Hacked point', 'site', 'active', 0, 0);
    raise exception 'FAIL: field user inserted a location';
  exception when others then
    if sqlstate <> '42501' then raise; end if;
  end;
  raise notice 'Field: read-only on map_locations ... OK';
end $$;
reset role;

-- manager: write yes; trips constraint enforced
do $$ begin
  perform set_config('request.jwt.claims', json_build_object('sub', '22bb33cc-2222-2222-2222-222222222222')::text, true);
end $$;
set local role authenticated;
do $$
declare v_loc uuid;
begin
  insert into public.map_locations (name, category, status, lat, lng, notes)
  values ('Test Camp', 'site', 'active', 21.0, 57.0, 'test')
  returning id into v_loc;

  insert into public.planned_trips (origin_location_id, dest_location_id, rate_per_km, fixed_fee, distance_km, cost)
  values (v_loc, (select id from public.map_locations where name = 'Port of Duqm'), 0.45, 25, 250, 137.5);

  begin
    insert into public.planned_trips (origin_location_id, rate_per_km, fixed_fee, distance_km, cost)
    values (v_loc, 0.45, 25, 100, 70); -- no destination at all
    raise exception 'FAIL: trip without destination accepted';
  exception when others then
    if sqlstate <> '23514' then raise; end if;
  end;
  raise notice 'Manager writes locations/trips; destination constraint enforced ... OK';
end $$;
reset role;

rollback;
