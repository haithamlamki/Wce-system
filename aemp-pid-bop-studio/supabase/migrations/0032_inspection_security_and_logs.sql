-- ============================================================================
--  0032_inspection_security_and_logs.sql — closes the gaps against the
--  Equipment Master Pro user guide (§5.9 logs, §5.14 user management,
--  account validity, unit-scoped visibility, unique Unit+Serial).
-- ============================================================================

-- ---- 1) Account validity (guide §5.14.3: expiry date + active switch) ----------
alter table public.profiles add column if not exists active boolean not null default true;
alter table public.profiles add column if not exists access_expiry date;

-- Admins manage users: read + update every profile (self policies from 0002 stay).
drop policy if exists profiles_admin_read on public.profiles;
create policy profiles_admin_read on public.profiles
  for select to authenticated using (public.is_privileged());

drop policy if exists profiles_admin_update on public.profiles;
create policy profiles_admin_update on public.profiles
  for update to authenticated
  using (public.is_privileged()) with check (public.is_privileged());

-- Self-update may not touch role / active / access_expiry (closes the 0002
-- self-promotion hole without breaking updateRig()).
create or replace function public.profiles_guard() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if not public.is_privileged() then
    if new.role is distinct from old.role
       or new.active is distinct from old.active
       or new.access_expiry is distinct from old.access_expiry then
      raise exception 'not authorized to change role or account validity';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists profiles_guard_tg on public.profiles;
create trigger profiles_guard_tg
  before update on public.profiles
  for each row execute function public.profiles_guard();

-- Client login gate: blocked when inactive or past expiry.
create or replace function public.account_blocked() returns boolean
  language sql security definer stable set search_path = public as
$$ select coalesce((select (not p.active)
                        or (p.access_expiry is not null and p.access_expiry < current_date)
                    from public.profiles p where p.id = auth.uid()), false) $$;

-- ---- 2) Approver choices for every submitter (fixes empty dropdown for
--         non-privileged users, who can only read their own profile row) -------
create or replace function public.insp_approver_choices()
  returns table (id uuid, name text)
  language sql security definer stable set search_path = public as
$$ select p.id, coalesce(nullif(p.full_name, ''), p.email, p.id::text)
   from public.profiles p
   where p.role in ('admin', 'manager') and p.active
   order by 2 $$;

-- ---- 3) Unit + Serial Number uniqueness (guide §5.6.2 / §5.7.3) ----------------
create unique index if not exists insp_records_unit_serial_key
  on public.insp_records (unit_id, lower(serial_number))
  where serial_number <> '';

-- ---- 4) Unit-scoped visibility (guide §2: "Each user only sees the Units
--         they are permitted to see"). Reuses user_unit_assignments +
--         assigned_unit_ids() from 0014; privileged users see everything. ------
drop policy if exists insp_records_read on public.insp_records;
create policy insp_records_read on public.insp_records
  for select to authenticated
  using (public.has_insp_perm('insp_view')
         and unit_id in (select public.assigned_unit_ids()));

drop policy if exists insp_records_insert on public.insp_records;
create policy insp_records_insert on public.insp_records
  for insert to authenticated
  with check (public.has_insp_perm('insp_data_entry')
              and unit_id in (select public.assigned_unit_ids()));

drop policy if exists insp_records_update on public.insp_records;
create policy insp_records_update on public.insp_records
  for update to authenticated
  using (public.has_insp_perm('insp_data_entry')
         and unit_id in (select public.assigned_unit_ids()))
  with check (public.has_insp_perm('insp_data_entry')
              and unit_id in (select public.assigned_unit_ids()));

-- Row delete comes to the UI in this revision (guide §5.5.6).
drop policy if exists insp_records_delete on public.insp_records;
create policy insp_records_delete on public.insp_records
  for delete to authenticated
  using (public.has_insp_perm('insp_data_entry')
         and unit_id in (select public.assigned_unit_ids()));

-- ---- 5) Per-record field-level change log (guide §5.9) -------------------------
-- changes = {"column": [old, new], ...}; created rows log [null, v], deletes [v, null].
create table if not exists public.insp_record_logs (
  id         bigint generated always as identity primary key,
  record_id  uuid not null,
  actor      uuid default auth.uid(),
  action     text not null check (action in ('created', 'updated', 'deleted')),
  changes    jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists insp_record_logs_record_idx
  on public.insp_record_logs (record_id, created_at desc);

alter table public.insp_record_logs enable row level security;
drop policy if exists insp_record_logs_read on public.insp_record_logs;
create policy insp_record_logs_read on public.insp_record_logs
  for select to authenticated using (public.has_insp_perm('insp_view'));
-- No insert/update/delete policies: rows are written only by the trigger below.

create or replace function public.insp_log_record_changes() returns trigger
  language plpgsql security definer set search_path = public as $$
declare
  ch jsonb := '{}'::jsonb;
  o jsonb; nw jsonb; k text;
  skip constant text[] := array['id','created_at','updated_at','created_by'];
begin
  if tg_op = 'INSERT' then
    nw := to_jsonb(new);
    for k in select jsonb_object_keys(nw) loop
      if not (k = any(skip)) and nw->k <> 'null'::jsonb then
        ch := ch || jsonb_build_object(k, jsonb_build_array(null, nw->k));
      end if;
    end loop;
    insert into public.insp_record_logs (record_id, action, changes)
    values (new.id, 'created', ch);
    return new;
  elsif tg_op = 'UPDATE' then
    o := to_jsonb(old); nw := to_jsonb(new);
    for k in select jsonb_object_keys(nw) loop
      if not (k = any(skip)) and (o->k) is distinct from (nw->k) then
        ch := ch || jsonb_build_object(k, jsonb_build_array(o->k, nw->k));
      end if;
    end loop;
    if ch <> '{}'::jsonb then
      insert into public.insp_record_logs (record_id, action, changes)
      values (new.id, 'updated', ch);
    end if;
    return new;
  else
    o := to_jsonb(old);
    for k in select jsonb_object_keys(o) loop
      if not (k = any(skip)) and o->k <> 'null'::jsonb then
        ch := ch || jsonb_build_object(k, jsonb_build_array(o->k, null));
      end if;
    end loop;
    insert into public.insp_record_logs (record_id, action, changes)
    values (old.id, 'deleted', ch);
    return old;
  end if;
end $$;

drop trigger if exists insp_records_log_tg on public.insp_records;
create trigger insp_records_log_tg
  after insert or update or delete on public.insp_records
  for each row execute function public.insp_log_record_changes();

-- ---- 6) Import RPC v2 — validates unit permission and Unit+Serial duplicates
--         with row-numbered errors before inserting anything (guide §5.6.2). ----
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
      pair := v_unit::text || '|' || v_serial;
      if pair = any(seen) then
        errs := errs || format('Row %s: duplicate Serial Number "%s" for the same unit inside this file', i, r->>'serial_number');
      end if;
      seen := seen || pair;
      if exists (select 1 from public.insp_records x
                 where x.unit_id = v_unit and lower(x.serial_number) = v_serial) then
        errs := errs || format('Row %s: a record with Serial Number "%s" already exists for this unit', i, r->>'serial_number');
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

-- ---- grants -------------------------------------------------------------------
do $$ declare f text;
begin
  foreach f in array array[
    'account_blocked()',
    'insp_approver_choices()'
  ] loop
    execute format('revoke all on function public.%s from public', f);
    execute format('revoke execute on function public.%s from anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
