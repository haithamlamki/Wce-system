-- ============================================================================
--  Inspection — reference re-sync (Oct 2026)
--
--  Brings the schema in line with the current source system
--  (einspection.abrajenergy.com) so its full export can be mirrored:
--    1. insp_specifications — the measurement/units catalog (Specifications page)
--    2. SAP equipment / asset numbers on equipment types (Equipment page)
--    3. approval workflow text fields + elastomer / inspection report columns
--       carried by the export (approvers are source-system people, not our
--       auth users, so they are stored as text)
--    4. insp_records_expanded exposes the new columns (appended at the end)
--    5. dashboard: all units in Compliance by Rig (no top-20 cap) and approval
--       turnaround measured from the request date when the source supplied it
--    6. record identity widened to Unit + Serial + Equipment + Part + Component:
--       the source now holds 105 records that share a Unit + Serial across
--       different equipment/parts, so the 0032 Unit + Serial rule is relaxed
--    7. insp_sync_reference — upsert on that identity, approval state included
-- ============================================================================

-- ---- 0) record identity ---------------------------------------------------------
drop index if exists public.insp_records_unit_serial_key;
create unique index if not exists insp_records_identity_key
  on public.insp_records (unit_id, lower(serial_number), type_id,
    coalesce(part_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(component_id, '00000000-0000-0000-0000-000000000000'::uuid))
  where serial_number <> '';
create index if not exists insp_records_unit_serial_idx
  on public.insp_records (unit_id, lower(serial_number));

-- Bulk upload validates against the same identity (was Unit + Serial in 0032).
create or replace function public.insp_import_records(p_rows jsonb) returns int
  language plpgsql security definer set search_path = public as $$
declare
  n int := 0; i int := 0; r jsonb;
  errs text[] := '{}';
  seen text[] := '{}';
  v_unit uuid; v_serial text; pair text;
begin
  if not public.has_insp_perm('insp_upload') then
    raise exception 'permission denied: insp_upload required';
  end if;

  -- pass 1: validate every row; nothing is imported if any row fails
  for r in select * from jsonb_array_elements(p_rows) loop
    i := i + 1;
    v_unit   := (r->>'unit_id')::uuid;
    v_serial := lower(coalesce(r->>'serial_number', ''));
    if v_unit not in (select public.assigned_unit_ids()) then
      errs := errs || format('Row %s: no permission for this unit', i);
    end if;
    if v_serial <> '' then
      pair := concat_ws('|', v_unit, v_serial, r->>'type_id', r->>'part_id', r->>'component_id');
      if pair = any(seen) then
        errs := errs || format('Row %s: duplicate Serial Number "%s" for the same unit and equipment part inside this file', i, r->>'serial_number');
      end if;
      seen := seen || pair;
      if exists (select 1 from public.insp_records x
                 where x.unit_id = v_unit and lower(x.serial_number) = v_serial
                   and x.type_id = (r->>'type_id')::uuid
                   and x.part_id is not distinct from (r->>'part_id')::uuid
                   and x.component_id is not distinct from (r->>'component_id')::uuid) then
        errs := errs || format('Row %s: a record with Serial Number "%s" already exists for this unit and equipment part', i, r->>'serial_number');
      end if;
    end if;
  end loop;
  if array_length(errs, 1) is not null then
    raise exception '%', array_to_string(errs, E'\n');
  end if;

  -- pass 2: insert
  for r in select * from jsonb_array_elements(p_rows) loop
    insert into public.insp_records
      (type_id, part_id, component_id, unit_id, company_id, component_description,
       oem, inspection_company, serial_number, part_number, working_status,
       manufacture_year, intermediate_date, intermediate_freq_months,
       major_date, major_freq_months, remarks, specs, approver_id, created_by)
    values
      ((r->>'type_id')::uuid, (r->>'part_id')::uuid, (r->>'component_id')::uuid,
       (r->>'unit_id')::uuid, (r->>'company_id')::uuid,
       coalesce(r->>'component_description',''),
       coalesce(r->>'oem',''), coalesce(r->>'inspection_company',''),
       coalesce(r->>'serial_number',''), coalesce(r->>'part_number',''),
       coalesce(r->>'working_status','in_use')::public.insp_working_status,
       (r->>'manufacture_year')::int,
       (r->>'intermediate_date')::date, (r->>'intermediate_freq_months')::smallint,
       (r->>'major_date')::date, (r->>'major_freq_months')::smallint,
       coalesce(r->>'remarks',''), coalesce(r->'specs','{}'::jsonb),
       (r->>'approver_id')::uuid, auth.uid());
    n := n + 1;
  end loop;
  insert into public.insp_audit_log (action, details)
  values ('import', jsonb_build_object('count', n));
  return n;
end $$;

-- ---- 1) specifications catalog ----------------------------------------------
create table if not exists public.insp_specifications (
  id           uuid primary key default gen_random_uuid(),
  measurement  text not null,
  units        text not null default '',
  abbreviation text not null default '',
  active       boolean not null default true,
  created_at   timestamptz not null default now(),
  unique (measurement, units)
);

alter table public.insp_specifications enable row level security;
drop policy if exists insp_specs_read on public.insp_specifications;
create policy insp_specs_read on public.insp_specifications
  for select to authenticated using (public.has_insp_perm('insp_view'));
drop policy if exists insp_specs_write on public.insp_specifications;
create policy insp_specs_write on public.insp_specifications
  for all to authenticated
  using (public.has_insp_perm('insp_manage_catalog'))
  with check (public.has_insp_perm('insp_manage_catalog'));

-- Snapshot of the source catalog (30 entries, 2026-10-21). Equipment types
-- reference a specification by its label "Measurement(abbreviation)".
insert into public.insp_specifications (measurement, units, abbreviation) values
  ('Clear Height', 'meters', 'm'),
  ('Diameters', 'inches', 'in'),
  ('Flow Rate', 'Gallons Per Minute', 'GPM'),
  ('Grade', 'Text', ''),
  ('Gross Weight', 'Ibs', 'Ibs'),
  ('Hard Banding', 'Text', ''),
  ('Height', 'meters', 'm'),
  ('Inner Diameter', 'inches', 'in'),
  ('Length', 'meters', 'm'),
  ('Load Capacity', 'dekanewtons', 'daN'),
  ('Max. Combined load', 'dekanewtons', 'daN'),
  ('Maximum Drilling Torque', 'deca Newton metre', 'daN.m'),
  ('Maximum Make-up / Break-out Torque', 'deca Newton metre', 'daN.m'),
  ('Model', 'text', ''),
  ('Nominal Breaking Strength', 'dekanewtons', 'daN'),
  ('Outer Diameter', 'inches', 'in'),
  ('Power Rating', 'Horsepower', 'HP'),
  ('Power Rating', 'kilowatt', 'KW'),
  ('Rotary capacity', 'dekanewtons', 'daN'),
  ('RPM', 'revolutions per minute', 'rpm'),
  ('Setback load', 'dekanewtons', 'daN'),
  ('Size', 'inches', 'in'),
  ('Temperature', 'Degrees Celsius', '°C'),
  ('Testing Pressure', 'Pounds per square inch', 'Psi'),
  ('Torque', 'Newton-Meters', 'N-m'),
  ('Type', 'Text', ''),
  ('Type of Connection', 'Text', ''),
  ('Volume', 'Cubic Meters', 'm3'),
  ('Weight', 'kilogram-meters', 'Kg/m'),
  ('Working Pressure', 'Pounds per square inch', 'Psi')
on conflict (measurement, units) do nothing;

-- ---- 1b) unit ownership (Units page: Name / Company / Description) -----------
-- The shared units register gains the owning company and the client
-- description the source shows; this also drives the Scope tree
-- (Company → Hoists / Drilling Rigs → Unit) on the Inspections page.
alter table public.units
  add column if not exists description text not null default '',
  add column if not exists company_id uuid references public.insp_companies(id) on delete set null;

insert into public.units (name, unit_type)
select v.name, 'rig' from (values ('Rig 308'), ('Rig 309'), ('Rig 310')) v(name)
where not exists (select 1 from public.units u where lower(u.name) = lower(v.name));

-- Snapshot of the source Units register (37 units, 2026-10-21).
with m(name, company, description) as (values
  ('FLST', 'Abraj Oman', ''),
  ('Hoist 1', 'Abraj Oman', 'PDO'), ('Hoist 2', 'Abraj Oman', 'PDO'),
  ('Hoist 3', 'Abraj Oman', 'PDO'), ('Hoist 4', 'Abraj Oman', 'PDO'),
  ('Hoist 5', 'Abraj Oman', 'PDO'),
  ('Rig 103', 'Abraj Oman', 'PDO'), ('Rig 104', 'Abraj Oman', 'PDO'),
  ('Rig 105', 'Abraj Oman', 'PDO'), ('Rig 106', 'Abraj Oman', 'PDO'),
  ('Rig 107', 'Abraj Oman', 'PDO'), ('Rig 108', 'Abraj Oman', 'PDO'),
  ('Rig 109', 'Abraj Oman', 'PDO'), ('Rig 110', 'Abraj Oman', 'OQEP'),
  ('Rig 111', 'Abraj Oman', 'OQEP'), ('Rig 112', 'Abraj Kuwait', 'WJO'),
  ('Rig 201', 'Abraj Oman', 'OXY'), ('Rig 202', 'Abraj Oman', 'PDO'),
  ('Rig 203', 'Abraj Oman', 'PDO'), ('Rig 204', 'Abraj Oman', 'ARA'),
  ('Rig 205', 'Abraj Oman', 'OQEP'), ('Rig 206', 'Abraj Oman', 'OXY'),
  ('Rig 207', 'Abraj Oman', 'OXY'), ('Rig 208', 'Abraj Oman', 'OXY'),
  ('Rig 209', 'Abraj Oman', 'OXY'), ('Rig 210', 'Abraj Oman', 'OQEP'),
  ('Rig 211', 'Abraj Kuwait', 'WJO'), ('Rig 302', 'Abraj Oman', 'PDO'),
  ('Rig 303', 'Abraj Oman', 'PDO'), ('Rig 304', 'Abraj Oman', 'PDO'),
  ('Rig 305', 'Abraj Oman', 'BP'), ('Rig 306', 'Abraj Oman', 'PDO'),
  ('Rig 307', 'Abraj Oman', 'PDO'), ('Rig 308', 'Abraj Oman', 'PDO'),
  ('Rig 309', 'Abraj Oman', 'Commissioning for PDO'),
  ('Rig 310', 'Abraj Oman', 'Commissioning for PDO'),
  ('Rig 401', 'Abraj Kuwait', 'WJO'))
update public.units u
   set company_id = c.id, description = m.description
  from m join public.insp_companies c on c.name = m.company
 where lower(u.name) = lower(m.name);

-- ---- 2) SAP numbers on equipment types ---------------------------------------
alter table public.insp_equipment_types
  add column if not exists sap_equipment_number text not null default '',
  add column if not exists sap_asset_number     text not null default '';

-- ---- 3) record columns carried by the source export --------------------------
alter table public.insp_records
  add column if not exists approval_requested_by  text,
  add column if not exists approval_requested_for text,
  add column if not exists approval_requested_at  timestamptz,
  add column if not exists approved_by_name       text,
  add column if not exists elastomer_description  text not null default '',
  add column if not exists inspection_report      text not null default '';

comment on column public.insp_records.approval_requested_at is
  'When approval was requested. Set by the reference sync; null for records entered here (created_at is used instead).';
comment on column public.insp_records.approved_by_name is
  'Approver as named by the source system (person or employee number). approved_by holds our auth user when approved here.';

-- ---- 4) expanded view: append the new columns --------------------------------
create or replace view public.insp_records_expanded
  with (security_invoker = true) as
select
  r.id, r.type_id, r.part_id, r.component_id, r.unit_id, r.company_id,
  r.component_description, r.oem, r.inspection_company, r.serial_number,
  r.part_number, r.working_status, r.manufacture_year,
  r.intermediate_date, r.intermediate_freq_months, r.intermediate_due_date,
  r.major_date, r.major_freq_months, r.major_due_date,
  r.remarks, r.specs, r.approve_status, r.approver_id, r.reject_reason,
  r.approved_at, r.approved_by, r.created_by, r.created_at, r.updated_at,
  t.category,
  t.name        as type_name,
  t.spec_fields,
  p.name        as part_name,
  c.name        as component_name,
  u.name        as unit_name,
  co.name       as company_name,
  r.approval_requested_by,
  r.approval_requested_for,
  r.approval_requested_at,
  r.approved_by_name,
  r.elastomer_description,
  r.inspection_report
from public.insp_records r
  join      public.insp_equipment_types  t  on t.id = r.type_id
  left join public.insp_equipment_parts  p  on p.id = r.part_id
  left join public.insp_part_components  c  on c.id = r.component_id
  join      public.units                 u  on u.id = r.unit_id
  left join public.insp_companies        co on co.id = r.company_id;

-- ---- 5) dashboard ---------------------------------------------------------------
create or replace function public.insp_dashboard_stats(p_today date default current_date)
returns jsonb language sql stable set search_path = public as $fn$
with base as (
  select e.*, (e.intermediate_due_date - p_today) as i_days, (e.major_due_date - p_today) as m_days
  from public.insp_records_expanded e
),
scored as (
  select b.*, least(
      coalesce(case when b.i_days is null then 3 when b.i_days < 0 then 0 when b.i_days <= 30 then 1 else 2 end, 3),
      coalesce(case when b.m_days is null then 3 when b.m_days < 0 then 0 when b.m_days <= 30 then 1 else 2 end, 3)) as rag
  from base b
),
due_dates as (select unnest(array[intermediate_due_date, major_due_date]) as due from base),
dd as (select (due - p_today) as days from due_dates where due is not null)
select jsonb_build_object(
  'total', (select count(*) from base),
  'scheduled', (select count(*) from scored where rag <> 3),
  'overdue', (select count(*) from scored where rag = 0),
  'dueSoon', (select count(*) from scored where rag = 1),
  'compliant', (select count(*) from scored where rag = 2),
  'obligations', (select count(*) from dd),
  'worstOverdueDays', coalesce((select max(-days) from dd where days < 0), 0),
  'aging', jsonb_build_object(
    '1-30', (select count(*) from dd where days < 0 and -days <= 30),
    '31-60', (select count(*) from dd where days < 0 and -days between 31 and 60),
    '60+', (select count(*) from dd where days < 0 and -days > 60)),
  'forecast', jsonb_build_object(
    'Next 30', (select count(*) from dd where days between 0 and 30),
    '31-60', (select count(*) from dd where days between 31 and 60),
    '61-90', (select count(*) from dd where days between 61 and 90)),
  'rigCompliance', (select coalesce(jsonb_agg(jsonb_build_object('label', label, 'value', pct) order by pct, label), '[]'::jsonb)
     from (select unit_name as label,
                  round(100.0 * count(*) filter (where rag = 2) / nullif(count(*) filter (where rag <> 3), 0)) as pct
           from scored group by unit_name having count(*) filter (where rag <> 3) > 0) r),
  'byCategory', (select coalesce(jsonb_agg(jsonb_build_object('label', label, 'compliant', c, 'dueSoon', d, 'overdue', o)), '[]'::jsonb)
     from (select category::text as label, count(*) filter (where rag = 2) c,
                  count(*) filter (where rag = 1) d, count(*) filter (where rag = 0) o
           from scored group by 1 order by count(*) desc limit 12) s),
  'byRig', (select coalesce(jsonb_agg(jsonb_build_object('label', label, 'compliant', c, 'dueSoon', d, 'overdue', o)), '[]'::jsonb)
     from (select unit_name as label, count(*) filter (where rag = 2) c,
                  count(*) filter (where rag = 1) d, count(*) filter (where rag = 0) o
           from scored group by 1 order by count(*) desc limit 12) s),
  'byStatus', (select coalesce(jsonb_agg(jsonb_build_object('label', label, 'compliant', c, 'dueSoon', d, 'overdue', o)), '[]'::jsonb)
     from (select case when approve_status = 'approved' then 'Approved' else 'Pending Approval' end as label,
                  count(*) filter (where rag = 2) c, count(*) filter (where rag = 1) d, count(*) filter (where rag = 0) o
           from scored group by 1) s),
  'kind', jsonb_build_array(
    jsonb_build_object('label','Intermediate','total',(select count(*) from base where intermediate_due_date is not null),
      'overdue',(select count(*) from base where i_days < 0)),
    jsonb_build_object('label','Major','total',(select count(*) from base where major_due_date is not null),
      'overdue',(select count(*) from base where m_days < 0))),
  'frequency', (select coalesce(jsonb_agg(jsonb_build_object('months', months, 'onTrack', ok, 'overdue', od, 'total', tot)), '[]'::jsonb)
     from (select months, count(*) filter (where not late) ok, count(*) filter (where late) od, count(*) tot
           from (select intermediate_freq_months as months, coalesce(i_days,0) < 0 as late from base where intermediate_freq_months is not null
                 union all select major_freq_months, coalesce(m_days,0) < 0 from base where major_freq_months is not null) f
           group by months order by count(*) desc) g),
  'ageBuckets', (select coalesce(jsonb_object_agg(bucket, n), '{}'::jsonb) from (
      select case when manufacture_year is null then 'Unknown'
                  when extract(year from p_today) - manufacture_year <= 5 then '0-5'
                  when extract(year from p_today) - manufacture_year <= 10 then '6-10'
                  when extract(year from p_today) - manufacture_year <= 15 then '11-15'
                  when extract(year from p_today) - manufacture_year <= 20 then '16-20'
                  else '20+' end as bucket, count(*) as n from base group by 1) a),
  'avgAge', coalesce((select round(avg(extract(year from p_today) - manufacture_year), 1) from base where manufacture_year is not null), 0),
  'oemCount', (select count(distinct coalesce(nullif(btrim(oem), ''), 'Unspecified')) from base),
  'oemTop', (select coalesce(jsonb_agg(jsonb_build_object('label', label, 'value', n)), '[]'::jsonb)
     from (select coalesce(nullif(btrim(oem), ''), 'Unspecified') as label, count(*) as n
           from base group by 1 order by count(*) desc limit 12) o),
  'trend', (select coalesce(jsonb_agg(jsonb_build_object('month', mon, 'intermediate', i, 'major', mj)), '[]'::jsonb)
     from (select to_char(m, 'YYYY-MM') as mon,
                  (select count(*) from base where date_trunc('month', intermediate_date) = m) as i,
                  (select count(*) from base where date_trunc('month', major_date) = m) as mj
           from generate_series(date_trunc('month', p_today::timestamp) - interval '11 months',
                                date_trunc('month', p_today::timestamp), interval '1 month') m
           order by m) t),
  'pending', (select count(*) from base where approve_status = 'pending_approval'),
  'approved', (select count(*) from base where approve_status = 'approved'),
  'avgApprovalDays', (select round(avg(extract(epoch from (approved_at - coalesce(approval_requested_at, created_at))) / 86400)::numeric, 1)
                        from base where approved_at is not null),
  'approvedLast30', (select count(*) from base where approved_at >= (p_today - 30)),
  'quality', jsonb_build_object(
    'Due date', (select count(*) from base where intermediate_due_date is null and major_due_date is null),
    'Serial', (select count(*) from base where btrim(coalesce(serial_number, '')) = ''),
    'Frequency', (select count(*) from base where intermediate_freq_months is null and major_freq_months is null),
    'Manuf. year', (select count(*) from base where manufacture_year is null),
    'OEM', (select count(*) from base where btrim(coalesce(oem, '')) = ''))
);
$fn$;

-- ---- 7) reference sync -----------------------------------------------------------
-- One row per source record, already resolved to our ids by the client.
-- Matches on the full identity (unit + serial + equipment + part + component);
-- when the client marks the row's unit + serial as unique in the file
-- (match_serial = true) and exactly one record here has it, that record is
-- updated even if its equipment/part changed upstream. Otherwise inserts.
-- Approval state is carried verbatim, so both upload and approve rights are
-- required.
create or replace function public.insp_sync_reference(p_rows jsonb) returns jsonb
  language plpgsql security definer set search_path = public as $$
declare
  r jsonb; v_id uuid; ins int := 0; upd int := 0;
begin
  if not (public.has_insp_perm('insp_upload') and public.has_insp_perm('insp_approve')) then
    raise exception 'permission denied: insp_upload and insp_approve required';
  end if;
  for r in select * from jsonb_array_elements(p_rows) loop
    v_id := null;
    if btrim(coalesce(r->>'serial_number', '')) <> '' then
      select id into v_id from public.insp_records
       where unit_id = (r->>'unit_id')::uuid
         and lower(serial_number) = lower(r->>'serial_number')
         and type_id = (r->>'type_id')::uuid
         and part_id is not distinct from (r->>'part_id')::uuid
         and component_id is not distinct from (r->>'component_id')::uuid
       limit 1;
      if v_id is null and coalesce((r->>'match_serial')::boolean, false) then
        select min(id::text)::uuid into v_id from public.insp_records
         where unit_id = (r->>'unit_id')::uuid
           and lower(serial_number) = lower(r->>'serial_number')
        having count(*) = 1;
      end if;
    end if;
    if v_id is null then
      insert into public.insp_records
        (type_id, part_id, component_id, unit_id, company_id, component_description,
         oem, inspection_company, serial_number, part_number, working_status,
         manufacture_year, intermediate_date, intermediate_freq_months,
         major_date, major_freq_months, remarks, specs,
         elastomer_description, inspection_report,
         approve_status, approval_requested_by, approval_requested_for,
         approval_requested_at, approved_by_name, approved_at, created_by)
      values
        ((r->>'type_id')::uuid, (r->>'part_id')::uuid, (r->>'component_id')::uuid,
         (r->>'unit_id')::uuid, (r->>'company_id')::uuid,
         coalesce(r->>'component_description',''),
         coalesce(r->>'oem',''), coalesce(r->>'inspection_company',''),
         r->>'serial_number', coalesce(r->>'part_number',''),
         coalesce(r->>'working_status','in_use')::public.insp_working_status,
         (r->>'manufacture_year')::int,
         (r->>'intermediate_date')::date, (r->>'intermediate_freq_months')::smallint,
         (r->>'major_date')::date, (r->>'major_freq_months')::smallint,
         coalesce(r->>'remarks',''), coalesce(r->'specs','{}'::jsonb),
         coalesce(r->>'elastomer_description',''), coalesce(r->>'inspection_report',''),
         (r->>'approve_status')::public.insp_approve_status,
         r->>'approval_requested_by', r->>'approval_requested_for',
         (r->>'approval_requested_at')::timestamptz, r->>'approved_by_name',
         (r->>'approved_at')::timestamptz, auth.uid());
      ins := ins + 1;
    else
      update public.insp_records set
        type_id = (r->>'type_id')::uuid,
        part_id = (r->>'part_id')::uuid,
        component_id = (r->>'component_id')::uuid,
        company_id = (r->>'company_id')::uuid,
        component_description = coalesce(r->>'component_description',''),
        oem = coalesce(r->>'oem',''),
        inspection_company = coalesce(r->>'inspection_company',''),
        serial_number = r->>'serial_number',
        part_number = coalesce(r->>'part_number',''),
        working_status = coalesce(r->>'working_status','in_use')::public.insp_working_status,
        manufacture_year = (r->>'manufacture_year')::int,
        intermediate_date = (r->>'intermediate_date')::date,
        intermediate_freq_months = (r->>'intermediate_freq_months')::smallint,
        major_date = (r->>'major_date')::date,
        major_freq_months = (r->>'major_freq_months')::smallint,
        remarks = coalesce(r->>'remarks',''),
        specs = coalesce(r->'specs','{}'::jsonb),
        elastomer_description = coalesce(r->>'elastomer_description',''),
        inspection_report = coalesce(r->>'inspection_report',''),
        approve_status = (r->>'approve_status')::public.insp_approve_status,
        approval_requested_by = r->>'approval_requested_by',
        approval_requested_for = r->>'approval_requested_for',
        approval_requested_at = (r->>'approval_requested_at')::timestamptz,
        approved_by_name = r->>'approved_by_name',
        approved_at = (r->>'approved_at')::timestamptz,
        reject_reason = null,
        updated_at = now()
      where id = v_id;
      upd := upd + 1;
    end if;
  end loop;
  insert into public.insp_audit_log (action, details)
  values ('reference_sync', jsonb_build_object('inserted', ins, 'updated', upd));
  return jsonb_build_object('inserted', ins, 'updated', upd);
end $$;

revoke all on function public.insp_sync_reference(jsonb) from public;
revoke execute on function public.insp_sync_reference(jsonb) from anon;
grant execute on function public.insp_sync_reference(jsonb) to authenticated;
