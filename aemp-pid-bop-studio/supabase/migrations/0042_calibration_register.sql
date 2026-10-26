-- ============================================================================
--  0042 — Calibration Register (TMMDE), mirroring the reference `/calibration`
--  module: one register per rig (unit) listing its calibrated instruments.
--
--    1. permissions insp_calibration_view / insp_calibration_edit
--    2. insp_cal_registers   — one per unit; title is one of four TMMDE kinds
--    3. insp_cal_instruments — identity = register + certificate + serial
--    4. insp_cal_tmmd_map    — instrument name → T/M/M/D per register title
--    5. calibration-certificates bucket (private, one file per instrument)
--    6. insp_cal_register_summary — counts + overdue/due-soon for the list
--  Rows are unit-scoped exactly like insp_records (assigned_unit_ids()).
-- ============================================================================

-- ---- 1) permissions ------------------------------------------------------------
alter table public.user_module_permissions
  drop constraint if exists user_module_permissions_permission_check;
alter table public.user_module_permissions
  add constraint user_module_permissions_permission_check check (permission in (
    'view','view_fleet','data_entry','approve_movements','approve_orders',
    'manage_orders','manage_catalog','manage_contracts','import','export',
    'manage_assignments',
    'insp_view','insp_data_entry','insp_approve','insp_upload',
    'insp_manage_catalog','insp_manage_files','insp_export',
    'insp_calibration_view','insp_calibration_edit'
  ));

-- ---- 2) registers ----------------------------------------------------------------
create table if not exists public.insp_cal_registers (
  id                 uuid primary key default gen_random_uuid(),
  unit_id            uuid not null unique references public.units(id) on delete restrict,
  title              text not null default 'Mechanical TMMDE calibration Register'
                     check (title in ('Mechanical TMMDE calibration Register',
                                      'Electrical TMMDE calibration Register',
                                      'Workshop TMMDE calibration Register',
                                      'Operations TMMDE calibration Register')),
  register_date      date,
  qualification_code text not null default '',
  revision_no        text not null default '',
  created_by         uuid references auth.users(id) default auth.uid(),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
drop trigger if exists insp_cal_registers_touch on public.insp_cal_registers;
create trigger insp_cal_registers_touch before update on public.insp_cal_registers
  for each row execute function public.touch_updated_at();

-- ---- 3) instruments ------------------------------------------------------------
create table if not exists public.insp_cal_instruments (
  id                  uuid primary key default gen_random_uuid(),
  register_id         uuid not null references public.insp_cal_registers(id) on delete cascade,
  sequence_no         integer,
  certificate_no      text not null default '',
  instrument          text not null default '',
  tmmd                text check (tmmd in ('Testing','Measuring','Monitoring','Detecting')),
  manufacturer        text not null default '',
  model               text not null default '',
  serial_number       text not null default '',
  measurement_range   text not null default '',
  location            text not null default '',
  grade               text not null default '',
  acceptance_criteria text not null default '',
  last_calibration    date,
  due_date            date,
  certifying_company  text not null default '',
  remarks             text not null default '',
  cert_file_path      text,
  cert_file_name      text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  check (due_date is null or last_calibration is null or due_date >= last_calibration)
);
create unique index if not exists insp_cal_instruments_identity
  on public.insp_cal_instruments (register_id, lower(btrim(certificate_no)), lower(btrim(serial_number)));
create index if not exists insp_cal_instruments_due on public.insp_cal_instruments (register_id, due_date);
drop trigger if exists insp_cal_instruments_touch on public.insp_cal_instruments;
create trigger insp_cal_instruments_touch before update on public.insp_cal_instruments
  for each row execute function public.touch_updated_at();

-- ---- 4) TMMD mapping -------------------------------------------------------------
create table if not exists public.insp_cal_tmmd_map (
  id         uuid primary key default gen_random_uuid(),
  title      text not null,
  instrument text not null,
  tmmd       text not null check (tmmd in ('Testing','Measuring','Monitoring','Detecting'))
);
create unique index if not exists insp_cal_tmmd_map_key
  on public.insp_cal_tmmd_map (title, lower(btrim(instrument)));
insert into public.insp_cal_tmmd_map (title, instrument, tmmd) values
  ('Mechanical TMMDE calibration Register','WEIGHT INDICATOR','Measuring'),
  ('Mechanical TMMDE calibration Register','PRESSURE GAUGE','Monitoring'),
  ('Mechanical TMMDE calibration Register','TORQUE GAUGE','Monitoring'),
  ('Mechanical TMMDE calibration Register','PRESSURE CHART RECORDER','Monitoring'),
  ('Mechanical TMMDE calibration Register','PRESSURE RELIEF VALVE','Detecting')
on conflict do nothing;

-- ---- RLS ---------------------------------------------------------------------------
create or replace function public.insp_cal_can_see_register(p_register uuid) returns boolean
  language sql security definer stable set search_path = public as
$$ select exists (select 1 from public.insp_cal_registers r
                  where r.id = p_register and r.unit_id in (select public.assigned_unit_ids())) $$;
revoke all on function public.insp_cal_can_see_register(uuid) from public, anon;
grant execute on function public.insp_cal_can_see_register(uuid) to authenticated;

alter table public.insp_cal_registers   enable row level security;
alter table public.insp_cal_instruments enable row level security;
alter table public.insp_cal_tmmd_map    enable row level security;

drop policy if exists insp_cal_registers_read on public.insp_cal_registers;
create policy insp_cal_registers_read on public.insp_cal_registers for select to authenticated
  using (public.has_insp_perm('insp_calibration_view') and unit_id in (select public.assigned_unit_ids()));
drop policy if exists insp_cal_registers_write on public.insp_cal_registers;
create policy insp_cal_registers_write on public.insp_cal_registers for all to authenticated
  using (public.has_insp_perm('insp_calibration_edit') and unit_id in (select public.assigned_unit_ids()))
  with check (public.has_insp_perm('insp_calibration_edit') and unit_id in (select public.assigned_unit_ids()));

drop policy if exists insp_cal_instruments_read on public.insp_cal_instruments;
create policy insp_cal_instruments_read on public.insp_cal_instruments for select to authenticated
  using (public.has_insp_perm('insp_calibration_view') and public.insp_cal_can_see_register(register_id));
drop policy if exists insp_cal_instruments_write on public.insp_cal_instruments;
create policy insp_cal_instruments_write on public.insp_cal_instruments for all to authenticated
  using (public.has_insp_perm('insp_calibration_edit') and public.insp_cal_can_see_register(register_id))
  with check (public.has_insp_perm('insp_calibration_edit') and public.insp_cal_can_see_register(register_id));

drop policy if exists insp_cal_tmmd_read on public.insp_cal_tmmd_map;
create policy insp_cal_tmmd_read on public.insp_cal_tmmd_map for select to authenticated
  using (public.has_insp_perm('insp_calibration_view'));
drop policy if exists insp_cal_tmmd_write on public.insp_cal_tmmd_map;
create policy insp_cal_tmmd_write on public.insp_cal_tmmd_map for all to authenticated
  using (public.has_insp_perm('insp_calibration_edit'))
  with check (public.has_insp_perm('insp_calibration_edit'));

-- ---- 5) certificate storage — path <register_id>/<instrument_id>/<file> ---------------
insert into storage.buckets (id, name, public)
values ('calibration-certificates','calibration-certificates', false)
on conflict (id) do nothing;

drop policy if exists insp_cal_cert_read on storage.objects;
create policy insp_cal_cert_read on storage.objects for select to authenticated
  using (bucket_id = 'calibration-certificates' and public.has_insp_perm('insp_calibration_view')
         and public.insp_cal_can_see_register(((storage.foldername(name))[1])::uuid));
drop policy if exists insp_cal_cert_write on storage.objects;
create policy insp_cal_cert_write on storage.objects for insert to authenticated
  with check (bucket_id = 'calibration-certificates' and public.has_insp_perm('insp_calibration_edit')
              and public.insp_cal_can_see_register(((storage.foldername(name))[1])::uuid));
drop policy if exists insp_cal_cert_update on storage.objects;
create policy insp_cal_cert_update on storage.objects for update to authenticated
  using (bucket_id = 'calibration-certificates' and public.has_insp_perm('insp_calibration_edit')
         and public.insp_cal_can_see_register(((storage.foldername(name))[1])::uuid));
drop policy if exists insp_cal_cert_delete on storage.objects;
create policy insp_cal_cert_delete on storage.objects for delete to authenticated
  using (bucket_id = 'calibration-certificates' and public.has_insp_perm('insp_calibration_edit')
         and public.insp_cal_can_see_register(((storage.foldername(name))[1])::uuid));

-- ---- 6) list summary (RLS of the base tables applies: security_invoker) --------------
create or replace view public.insp_cal_register_summary with (security_invoker = true) as
select r.id, r.unit_id, u.name as unit_name, r.title, r.register_date, r.qualification_code, r.revision_no,
       count(i.id)::int as instrument_count,
       count(i.id) filter (where i.due_date < current_date)::int as overdue_count,
       count(i.id) filter (where i.due_date >= current_date and i.due_date <= current_date + 30)::int as due_soon_count
from public.insp_cal_registers r
join public.units u on u.id = r.unit_id
left join public.insp_cal_instruments i on i.register_id = r.id
group by r.id, u.name;
grant select on public.insp_cal_register_summary to authenticated;
