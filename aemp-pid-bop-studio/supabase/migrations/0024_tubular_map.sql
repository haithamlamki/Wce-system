-- ============================================================================
--  0024_tubular_map.sql — Tubular module: map locations + planned trips.
--  Backs the restored Asset & Logistics Map interface (UI-parity work): the
--  prototype kept sites/logistics/rig/hoist points and planned trips in
--  browser localStorage; these tables give the same interface a real,
--  RLS-protected home. Distances remain straight-line (haversine, computed
--  client-side) — no external routing service (approved decision).
--  Seeds the prototype's 32 default points.
-- ============================================================================

create table if not exists public.map_locations (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  category   text not null check (category in ('site', 'logistics', 'rig', 'hoist')),
  status     text not null default 'active' check (status in ('active', 'inactive', 'expired')),
  lat        numeric not null,
  lng        numeric not null,
  notes      text,
  unit_id    uuid references public.units(id),
  created_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists map_locations_touch on public.map_locations;
create trigger map_locations_touch
  before update on public.map_locations
  for each row execute function public.touch_updated_at();

create table if not exists public.planned_trips (
  id                   uuid primary key default gen_random_uuid(),
  origin_location_id   uuid not null references public.map_locations(id) on delete cascade,
  dest_location_id     uuid references public.map_locations(id) on delete cascade,
  dest_name            text,
  dest_lat             numeric,
  dest_lng             numeric,
  rate_per_km          numeric not null default 0.45,
  fixed_fee            numeric not null default 25,
  distance_km          numeric not null,
  cost                 numeric not null,
  order_id             uuid references public.pipe_orders(id),
  created_by           uuid references auth.users(id) default auth.uid(),
  created_at           timestamptz not null default now(),
  constraint planned_trips_dest check (dest_location_id is not null or (dest_name is not null and dest_lat is not null and dest_lng is not null))
);

alter table public.map_locations enable row level security;
alter table public.planned_trips enable row level security;

drop policy if exists map_locations_read on public.map_locations;
create policy map_locations_read on public.map_locations
  for select to authenticated using (true);
drop policy if exists map_locations_write on public.map_locations;
create policy map_locations_write on public.map_locations
  for all to authenticated
  using (public.is_privileged()) with check (public.is_privileged());

drop policy if exists planned_trips_read on public.planned_trips;
create policy planned_trips_read on public.planned_trips
  for select to authenticated using (true);
drop policy if exists planned_trips_write on public.planned_trips;
create policy planned_trips_write on public.planned_trips
  for all to authenticated
  using (public.is_privileged()) with check (public.is_privileged());

-- seed the prototype's default points (idempotent by name)
insert into public.map_locations (name, category, status, lat, lng, notes)
select * from (values
  ('Abraj Energy Services - Head Office', 'site', 'active', 23.5705745, 58.290937, null),
  ('Abraj - Central Warehouse', 'site', 'active', 23.4949684, 58.2570304, null),
  ('Abraj - Adam Base', 'site', 'active', 22.3120834, 57.511411, null),
  ('Abraj - Rig 110 Camp', 'site', 'active', 21.3849793, 55.7896585, null),
  ('Port of Salalah', 'logistics', 'active', 16.9414873, 53.9953894, null),
  ('Sohar Port and Freezone', 'logistics', 'active', 24.5021875, 56.5931875, null),
  ('Port of Duqm', 'logistics', 'active', 19.664013, 57.7268223, null),
  ('Duqm Special Economic Zone (SEZAD)', 'logistics', 'active', 19.529473, 57.6158803, null),
  ('Khazaen Economic City', 'logistics', 'active', 23.5842759, 57.8009035, null),
  ('Mina Sultan Qaboos (Muttrah)', 'logistics', 'active', 23.6286554, 58.5659182, null),
  ('Muscat International Airport', 'logistics', 'active', 23.6006408, 58.2827449, null),
  ('Salalah International Airport', 'logistics', 'active', 17.0471634, 54.0880886, null),
  ('Rig 210', 'rig', 'active', 21.387705742692294, 55.740053699949804, 'Field: Abu Tubul'),
  ('Rig 111', 'rig', 'active', 20.92458222698496, 55.69782385967238, 'Field: Abu Tubul'),
  ('Rig 205', 'rig', 'active', 21.025620851829228, 55.785608006713545, 'Field: Abu Tubul'),
  ('Rig 110', 'rig', 'active', 20.950263095687454, 55.78503224502618, 'Field: Abu Tubul'),
  ('Rig Abraj 305', 'rig', 'active', 21.799377702472935, 56.11630822199625, 'Field: Khazzan & Ghazeer'),
  ('RIG 43', 'rig', 'active', 21.490081341233534, 55.67272035664921, 'Field: Raba East'),
  ('RIG 44', 'rig', 'active', 20.882569717851002, 55.72152168723696, 'Field: Bout'),
  ('RIG 45', 'rig', 'active', 21.459827310459882, 55.6797918042347, 'Field: BRN'),
  ('RIG 62', 'rig', 'active', 21.990311757663957, 57.591888481055705, 'Field: Ramlat Rawl'),
  ('RIG 63', 'rig', 'active', 21.452814056818312, 55.69240129002773, 'Field: BRNW'),
  ('RIG 64', 'rig', 'active', 20.87588075103471, 55.853682052099984, 'Field: Saih Rawl'),
  ('RIG 126', 'rig', 'active', 21.499025415809363, 55.756804876489845, 'Field: Thulailat'),
  ('RIG 127', 'rig', 'active', 21.538667478486694, 55.724135275975115, 'Field: Marmul'),
  ('RIG 128', 'rig', 'active', 21.52012944499184, 55.8082328389776, 'Field: Marmul RTQ'),
  ('RIG 129', 'rig', 'active', 18.777270458894407, 56.02107539406738, 'Field: Fahud'),
  ('Hoist 53', 'hoist', 'active', 20.88197768642137, 55.742326572122494, 'Field: Qarn Alam'),
  ('Hoist 57', 'hoist', 'active', 21.458009776938056, 56.69384607150306, 'Field: Qarn Alam'),
  ('Hoist 58', 'hoist', 'active', 22.497927220680726, 56.2789835912022, 'Field: Fahud'),
  ('Hoist 59', 'hoist', 'active', 20.887706082582184, 55.853813901352694, 'Field: Fahud'),
  ('Hoist 60', 'hoist', 'active', 21.550159957362574, 55.70929202456962, 'Field: Fahud'),
  ('Rig-206', 'rig', 'expired', 22.735262066380443, 56.69600227819539, 'Field: Oxy North'),
  ('Rig-207', 'rig', 'expired', 22.831849509656276, 56.47880174992284, 'Field: Oxy North'),
  ('Rig-208', 'rig', 'expired', 22.750921654731947, 56.197546524111935, 'Field: Oxy North'),
  ('Rig-209', 'rig', 'expired', 22.69818023331673, 56.51648418504468, 'Field: Oxy North'),
  ('Rig 204', 'rig', 'active', 20.88207885182801, 55.90487672366061, 'Field: Qarat Al Milh Small Fields (QSF) / Farha SW')
) as v(name, category, status, lat, lng, notes)
where not exists (select 1 from public.map_locations m where m.name = v.name);
