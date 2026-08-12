-- ============================================================================
--  0030_inspection_records.sql — inspection records + server-computed due
--  dates + approval / bulk-update / import RPCs. Due dates are ALWAYS derived
--  (date + frequency) by trigger; the client never writes *_due_date.
-- ============================================================================

create table if not exists public.insp_records (
  id                       uuid primary key default gen_random_uuid(),
  type_id                  uuid not null references public.insp_equipment_types(id),
  part_id                  uuid references public.insp_equipment_parts(id),
  component_id             uuid references public.insp_part_components(id),
  unit_id                  uuid not null references public.units(id),
  company_id               uuid references public.insp_companies(id),
  component_description    text not null default '',
  oem                      text not null default '',
  inspection_company       text not null default '',
  serial_number            text not null default '',
  part_number              text not null default '',
  working_status           public.insp_working_status not null default 'in_use',
  manufacture_year         int check (manufacture_year is null or manufacture_year between 1950 and 2100),
  intermediate_date        date,
  intermediate_freq_months smallint check (intermediate_freq_months is null or intermediate_freq_months in (6,12,24,36,48,60)),
  intermediate_due_date    date,
  major_date               date,
  major_freq_months        smallint check (major_freq_months is null or major_freq_months in (6,12,24,36,48,60,120,144)),
  major_due_date           date,
  remarks                  text not null default '',
  specs                    jsonb not null default '{}'::jsonb, -- {"Size (in)":"13 5/8", ...}
  approve_status           public.insp_approve_status not null default 'pending_approval',
  approver_id              uuid references auth.users(id),
  reject_reason            text,
  created_by               uuid not null default auth.uid() references auth.users(id),
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

create index if not exists insp_records_unit_idx    on public.insp_records(unit_id);
create index if not exists insp_records_type_idx    on public.insp_records(type_id);
create index if not exists insp_records_status_idx  on public.insp_records(approve_status);
create index if not exists insp_records_idue_idx    on public.insp_records(intermediate_due_date);
create index if not exists insp_records_mdue_idx    on public.insp_records(major_due_date);
create index if not exists insp_records_serial_idx  on public.insp_records(serial_number);

create or replace function public.insp_set_due_dates() returns trigger
  language plpgsql as $$
begin
  new.intermediate_due_date :=
    case when new.intermediate_date is null or new.intermediate_freq_months is null
         then null
         else (new.intermediate_date + make_interval(months => new.intermediate_freq_months))::date end;
  new.major_due_date :=
    case when new.major_date is null or new.major_freq_months is null
         then null
         else (new.major_date + make_interval(months => new.major_freq_months))::date end;
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists insp_records_due_dates on public.insp_records;
create trigger insp_records_due_dates
  before insert or update on public.insp_records
  for each row execute function public.insp_set_due_dates();

-- ---- RLS ----------------------------------------------------------------------
alter table public.insp_records enable row level security;

drop policy if exists insp_records_read on public.insp_records;
create policy insp_records_read on public.insp_records
  for select to authenticated using (public.has_insp_perm('insp_view'));

drop policy if exists insp_records_insert on public.insp_records;
create policy insp_records_insert on public.insp_records
  for insert to authenticated
  with check (public.has_insp_perm('insp_data_entry'));

drop policy if exists insp_records_update on public.insp_records;
create policy insp_records_update on public.insp_records
  for update to authenticated
  using (public.has_insp_perm('insp_data_entry'))
  with check (public.has_insp_perm('insp_data_entry'));

drop policy if exists insp_records_delete on public.insp_records;
create policy insp_records_delete on public.insp_records
  for delete to authenticated using (public.is_privileged());

-- ---- expanded read view (labels joined; RLS of base tables applies) ------------
create or replace view public.insp_records_expanded
  with (security_invoker = true) as
select r.*,
       t.category, t.name as type_name, t.spec_fields,
       p.name  as part_name,
       c.name  as component_name,
       u.name  as unit_name,
       co.name as company_name
from public.insp_records r
join public.insp_equipment_types t on t.id = r.type_id
left join public.insp_equipment_parts p on p.id = r.part_id
left join public.insp_part_components c on c.id = r.component_id
join public.units u on u.id = r.unit_id
left join public.insp_companies co on co.id = r.company_id;

-- ---- audit log ------------------------------------------------------------------
create table if not exists public.insp_audit_log (
  id         bigint generated always as identity primary key,
  actor      uuid not null default auth.uid(),
  action     text not null,          -- 'bulk_update_dates' | 'approve' | 'reject' | 'import'
  record_ids uuid[] not null default '{}',
  details    jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
alter table public.insp_audit_log enable row level security;
drop policy if exists insp_audit_read on public.insp_audit_log;
create policy insp_audit_read on public.insp_audit_log
  for select to authenticated using (public.is_privileged());

-- ---- RPCs (SECURITY DEFINER, perm-guarded, audited) ------------------------------
create or replace function public.insp_bulk_update_dates(
  p_ids uuid[], p_major date, p_intermediate date
) returns int
  language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not public.has_insp_perm('insp_data_entry') then
    raise exception 'permission denied: insp_data_entry required';
  end if;
  if p_major is null and p_intermediate is null then
    raise exception 'nothing to update: provide a major and/or intermediate date';
  end if;
  update public.insp_records
     set major_date        = coalesce(p_major, major_date),
         intermediate_date = coalesce(p_intermediate, intermediate_date)
   where id = any(p_ids);
  get diagnostics n = row_count;
  insert into public.insp_audit_log (action, record_ids, details)
  values ('bulk_update_dates', p_ids,
          jsonb_build_object('major', p_major, 'intermediate', p_intermediate));
  return n;
end $$;

create or replace function public.insp_set_approval(
  p_ids uuid[], p_approve boolean, p_reason text default null
) returns int
  language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not public.has_insp_perm('insp_approve') then
    raise exception 'permission denied: insp_approve required';
  end if;
  update public.insp_records
     set approve_status = case when p_approve then 'approved'::public.insp_approve_status
                               else 'rejected'::public.insp_approve_status end,
         reject_reason  = case when p_approve then null else p_reason end,
         approver_id    = auth.uid()
   where id = any(p_ids);
  get diagnostics n = row_count;
  insert into public.insp_audit_log (action, record_ids, details)
  values (case when p_approve then 'approve' else 'reject' end, p_ids,
          jsonb_build_object('reason', p_reason));
  return n;
end $$;

-- Bulk import: array of row objects using the SAME keys as insp_records columns
-- (type_id, part_id, component_id, unit_id, company_id, oem, ... specs).
create or replace function public.insp_import_records(p_rows jsonb) returns int
  language plpgsql security definer set search_path = public as $$
declare n int := 0; r jsonb;
begin
  if not public.has_insp_perm('insp_upload') then
    raise exception 'permission denied: insp_upload required';
  end if;
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

do $$ declare f text;
begin
  foreach f in array array[
    'insp_bulk_update_dates(uuid[],date,date)',
    'insp_set_approval(uuid[],boolean,text)',
    'insp_import_records(jsonb)'
  ] loop
    execute format('revoke all on function public.%s from public', f);
    execute format('revoke execute on function public.%s from anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
