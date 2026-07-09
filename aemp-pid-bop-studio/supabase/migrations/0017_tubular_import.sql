-- ============================================================================
--  0017_tubular_import.sql — Tubular module: workbook import pipeline.
--  --------------------------------------------------------------------------
--  Staged import of the multi-sheet "Tubular_Monitoring and data entry.xlsx":
--  the client parses all Rig/Hoist sheets (workbookImport.ts, strict — errors
--  never coerced) and stages the mapped rows here for PREVIEW; a separate,
--  explicit COMMIT applies them transactionally; ROLLBACK restores exact
--  pre-images. Dashboard/Master sheets are never import sources (derived).
--
--  Guarantees:
--    - stage never touches tubular_records;
--    - commit is one transaction: per staged row insert-or-update a record
--      (matched by unit + catalog item + occurrence index so duplicate
--      descriptions round-trip with stable identity), snapshot the pre-image
--      into import_rows.prior, and write one 'import' submission per unit;
--    - typed On Board totals that disagree with the class sum land in
--      on_board_override (the 85 legacy rows) — never recomputed away;
--    - rows staged with an error are recorded as 'skip' and reported, never
--      silently dropped at commit;
--    - rollback restores prior images / deletes batch inserts, and REFUSES if
--      any affected unit has a later non-import submission (field entries
--      would be destroyed) — approved-plan Open Question #4 default.
-- ============================================================================

do $$ begin
  create type public.import_status as enum ('preview', 'committed', 'rolled_back', 'failed');
exception when duplicate_object then null;
end $$;

create table if not exists public.import_batches (
  id           uuid primary key default gen_random_uuid(),
  uploaded_by  uuid not null references auth.users(id),
  uploaded_at  timestamptz not null default now(),
  filename     text not null,
  file_hash    text,
  status       public.import_status not null default 'preview',
  stats        jsonb,
  committed_at timestamptz,
  rolled_back_at timestamptz
);

create table if not exists public.import_rows (
  id         uuid primary key default gen_random_uuid(),
  batch_id   uuid not null references public.import_batches(id) on delete cascade,
  sheet_name text not null,
  row_num    int  not null,
  unit_id    uuid references public.units(id),
  catalog_item_id uuid references public.tubular_catalog(id),
  occurrence_index int not null default 1,
  mapped     jsonb not null,        -- quantities/date/remarks as staged
  issues     jsonb not null default '[]'::jsonb,
  action     text not null default 'skip' check (action in ('insert', 'update', 'skip')),
  record_id  uuid,                  -- set at commit
  prior      jsonb                  -- pre-image at commit (null for inserts)
);

create index if not exists import_rows_batch_idx on public.import_rows (batch_id);

-- link submissions written by an import back to their batch
alter table public.tubular_submissions
  drop constraint if exists tubular_submissions_import_batch_fk;
alter table public.tubular_submissions
  add constraint tubular_submissions_import_batch_fk
  foreign key (import_batch_id) references public.import_batches(id);

alter table public.import_batches enable row level security;
alter table public.import_rows enable row level security;

drop policy if exists import_batches_read on public.import_batches;
create policy import_batches_read on public.import_batches
  for select to authenticated
  using (public.is_privileged()
         or (public.has_tubular_perm('import') and uploaded_by = auth.uid()));

drop policy if exists import_rows_read on public.import_rows;
create policy import_rows_read on public.import_rows
  for select to authenticated
  using (exists (select 1 from public.import_batches b
                 where b.id = batch_id
                   and (public.is_privileged()
                        or (public.has_tubular_perm('import') and b.uploaded_by = auth.uid()))));
-- writes only via the RPCs below.

-- ---- stage --------------------------------------------------------------------
-- p_rows: array of workbookImport.toStageRows() objects.
create or replace function public.stage_import(
  p_filename text,
  p_file_hash text,
  p_rows jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_batch uuid;
  v_staged int := 0;
  v_skipped int := 0;
  v_unknown_units int := 0;
begin
  if not public.has_tubular_perm('import') then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if p_rows is null or jsonb_typeof(p_rows) is distinct from 'array' then
    raise exception 'p_rows must be a json array' using errcode = '22023';
  end if;
  if jsonb_array_length(p_rows) > 10000 then
    raise exception 'too many rows' using errcode = '22023';
  end if;

  insert into public.import_batches (uploaded_by, filename, file_hash)
  values (auth.uid(), p_filename, p_file_hash)
  returning id into v_batch;

  insert into public.import_rows
    (batch_id, sheet_name, row_num, unit_id, catalog_item_id, occurrence_index,
     mapped, issues, action)
  select
    v_batch,
    x.sheet_name,
    x.row_num,
    u.id,
    c.id,
    coalesce(x.occurrence_index, 1),
    to_jsonb(x) - 'issues',
    coalesce(x.issues, '[]'::jsonb),
    case
      when coalesce(x.has_error, false) or u.id is null or c.id is null then 'skip'
      else 'insert'  -- provisional; commit resolves insert vs update per record match
    end
  from jsonb_to_recordset(p_rows) as x(
    sheet_name text, row_num int, unit_name text, category public.tubular_category,
    description text, occurrence_index int,
    on_contract int, premium int, class2 int, class3 int, scrap int,
    needs_inspection int, damaged_on_location int, send_to_repair int,
    to_other_rig int, receive_from_rig int,
    on_board_reported int, rental_date date, remarks text,
    entry_date date, contract_ref text, issues jsonb, has_error boolean)
  left join public.units u on u.name = x.unit_name
  left join public.tubular_catalog c
    on c.category = x.category and c.description = x.description;

  select count(*) filter (where action <> 'skip'),
         count(*) filter (where action = 'skip'),
         count(*) filter (where unit_id is null)
    into v_staged, v_skipped, v_unknown_units
  from public.import_rows where batch_id = v_batch;

  update public.import_batches
    set stats = jsonb_build_object('staged', v_staged, 'skipped', v_skipped,
                                   'unknown_units', v_unknown_units,
                                   'total', v_staged + v_skipped)
  where id = v_batch;

  return jsonb_build_object('batch_id', v_batch, 'staged', v_staged, 'skipped', v_skipped);
end;
$$;

revoke all on function public.stage_import(text, text, jsonb) from public;
revoke execute on function public.stage_import(text, text, jsonb) from anon;
grant execute on function public.stage_import(text, text, jsonb) to authenticated;

-- ---- commit -------------------------------------------------------------------
create or replace function public.commit_import(p_batch_id uuid) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_batch public.import_batches%rowtype;
  r record;
  v_record uuid;
  v_prior jsonb;
  v_inserted int := 0;
  v_updated int := 0;
  v_skipped int := 0;
  v_unit uuid;
  v_sub uuid;
begin
  if not public.has_tubular_perm('import') then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  select * into v_batch from public.import_batches where id = p_batch_id for update;
  if v_batch.id is null then
    raise exception 'unknown batch' using errcode = '22023';
  end if;
  if v_batch.status is distinct from 'preview' then
    raise exception 'batch is % — only preview batches can be committed', v_batch.status
      using errcode = '22023';
  end if;
  if not public.is_privileged() and v_batch.uploaded_by is distinct from auth.uid() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  for r in
    select ir.id as import_row_id, ir.*,
           (ir.mapped->>'on_contract')::int        as m_on_contract,
           (ir.mapped->>'premium')::int            as m_premium,
           (ir.mapped->>'class2')::int             as m_class2,
           (ir.mapped->>'class3')::int             as m_class3,
           (ir.mapped->>'scrap')::int              as m_scrap,
           (ir.mapped->>'needs_inspection')::int   as m_needs,
           (ir.mapped->>'damaged_on_location')::int as m_damaged,
           (ir.mapped->>'send_to_repair')::int     as m_repair,
           (ir.mapped->>'to_other_rig')::int       as m_to_other,
           (ir.mapped->>'receive_from_rig')::int   as m_from_rig,
           (ir.mapped->>'on_board_reported')::int  as m_reported,
           (ir.mapped->>'rental_date')::date       as m_rental,
           (ir.mapped->>'remarks')                 as m_remarks,
           (ir.mapped->>'row_num')::int            as m_row_num
    from public.import_rows ir
    where ir.batch_id = p_batch_id
    order by ir.sheet_name, ir.row_num
  loop
    if r.action = 'skip' then
      v_skipped := v_skipped + 1;
      continue;
    end if;

    -- stable duplicate identity: nth occurrence of (unit, item) by position
    select id into v_record from (
      select id, row_number() over (order by position, created_at, id) as occ
      from public.tubular_records
      where unit_id = r.unit_id and catalog_item_id = r.catalog_item_id and not archived
    ) t where t.occ = r.occurrence_index;

    if v_record is null then
      insert into public.tubular_records (
        unit_id, catalog_item_id, position,
        on_contract, premium, class2, class3, scrap, needs_inspection,
        damaged_on_location, send_to_repair, to_other_rig, receive_from_rig,
        on_board_override, rental_date, remarks, created_by, updated_by)
      values (
        r.unit_id, r.catalog_item_id, r.m_row_num,
        r.m_on_contract, r.m_premium, r.m_class2, r.m_class3, r.m_scrap, r.m_needs,
        r.m_damaged, r.m_repair, r.m_to_other, r.m_from_rig,
        r.m_reported, r.m_rental, r.m_remarks, auth.uid(), auth.uid())
      returning id into v_record;
      v_inserted := v_inserted + 1;
      update public.import_rows
        set action = 'insert', record_id = v_record, prior = null
        where id = r.import_row_id;
    else
      select to_jsonb(t) into v_prior from public.tubular_records t where t.id = v_record;
      update public.tubular_records set
        position = r.m_row_num,
        on_contract = r.m_on_contract, premium = r.m_premium, class2 = r.m_class2,
        class3 = r.m_class3, scrap = r.m_scrap, needs_inspection = r.m_needs,
        damaged_on_location = r.m_damaged, send_to_repair = r.m_repair,
        to_other_rig = r.m_to_other, receive_from_rig = r.m_from_rig,
        on_board_override = r.m_reported, rental_date = r.m_rental,
        remarks = r.m_remarks, updated_by = auth.uid()
      where id = v_record;
      v_updated := v_updated + 1;
      update public.import_rows
        set action = 'update', record_id = v_record, prior = v_prior
        where id = r.import_row_id;
    end if;
  end loop;

  -- one 'import' submission per touched unit (full audit of post-import state)
  for v_unit in
    select distinct unit_id from public.import_rows
    where batch_id = p_batch_id and record_id is not null
  loop
    insert into public.tubular_submissions (unit_id, submitted_by, source, entry_date, import_batch_id, note)
    values (v_unit, auth.uid(), 'import',
            (select max((mapped->>'entry_date')::date) from public.import_rows
             where batch_id = p_batch_id and unit_id = v_unit),
            p_batch_id, 'workbook import ' || v_batch.filename)
    returning id into v_sub;

    insert into public.tubular_submission_lines (
      submission_id, record_id, on_contract, premium, class2, class3, scrap,
      needs_inspection, damaged_on_location, send_to_repair, to_other_rig,
      receive_from_rig, on_board_override, rental_date, remarks, archived)
    select v_sub, t.id, t.on_contract, t.premium, t.class2, t.class3, t.scrap,
           t.needs_inspection, t.damaged_on_location, t.send_to_repair,
           t.to_other_rig, t.receive_from_rig, t.on_board_override,
           t.rental_date, t.remarks, t.archived
    from public.tubular_records t
    where t.id in (select record_id from public.import_rows
                   where batch_id = p_batch_id and unit_id = v_unit and record_id is not null);
  end loop;

  -- clock_timestamp(): the actual commit instant, not the transaction start —
  -- submissions written later (even in the same transaction) compare as newer,
  -- which the rollback refusal check depends on.
  update public.import_batches
    set status = 'committed', committed_at = clock_timestamp(),
        stats = coalesce(stats, '{}'::jsonb)
          || jsonb_build_object('inserted', v_inserted, 'updated', v_updated, 'skipped', v_skipped)
  where id = p_batch_id;

  return jsonb_build_object('inserted', v_inserted, 'updated', v_updated, 'skipped', v_skipped);
end;
$$;

revoke all on function public.commit_import(uuid) from public;
revoke execute on function public.commit_import(uuid) from anon;
grant execute on function public.commit_import(uuid) to authenticated;

-- ---- rollback -----------------------------------------------------------------
create or replace function public.rollback_import(p_batch_id uuid) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_batch public.import_batches%rowtype;
  r record;
begin
  if not public.has_tubular_perm('import') then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  select * into v_batch from public.import_batches where id = p_batch_id for update;
  if v_batch.id is null then
    raise exception 'unknown batch' using errcode = '22023';
  end if;
  if v_batch.status is distinct from 'committed' then
    raise exception 'batch is % — only committed batches can be rolled back', v_batch.status
      using errcode = '22023';
  end if;
  if not public.is_privileged() and v_batch.uploaded_by is distinct from auth.uid() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  -- refuse if any affected unit has been edited since the import (a rollback
  -- would silently destroy field entries) — safest default per approved plan.
  if exists (
    select 1 from public.tubular_submissions s
    where s.unit_id in (select distinct unit_id from public.import_rows
                        where batch_id = p_batch_id and record_id is not null)
      and s.submitted_at > v_batch.committed_at
      and (s.import_batch_id is distinct from p_batch_id)
  ) then
    raise exception 'units have newer submissions since this import — rollback refused'
      using errcode = '55000';
  end if;

  for r in
    select * from public.import_rows
    where batch_id = p_batch_id and record_id is not null
    order by sheet_name desc, row_num desc
  loop
    if r.action = 'insert' then
      delete from public.tubular_submission_lines where record_id = r.record_id;
      delete from public.tubular_records where id = r.record_id;
    elsif r.action = 'update' and r.prior is not null then
      update public.tubular_records t set
        position            = (r.prior->>'position')::int,
        on_contract         = (r.prior->>'on_contract')::int,
        premium             = (r.prior->>'premium')::int,
        class2              = (r.prior->>'class2')::int,
        class3              = (r.prior->>'class3')::int,
        scrap               = (r.prior->>'scrap')::int,
        needs_inspection    = (r.prior->>'needs_inspection')::int,
        damaged_on_location = (r.prior->>'damaged_on_location')::int,
        send_to_repair      = (r.prior->>'send_to_repair')::int,
        to_other_rig        = (r.prior->>'to_other_rig')::int,
        receive_from_rig    = (r.prior->>'receive_from_rig')::int,
        on_board_override   = (r.prior->>'on_board_override')::int,
        rental_date         = (r.prior->>'rental_date')::date,
        remarks             = r.prior->>'remarks',
        archived            = (r.prior->>'archived')::boolean,
        updated_by          = auth.uid()
      where t.id = r.record_id;
    end if;
  end loop;

  -- the import's own submissions are part of the rolled-back state
  delete from public.tubular_submission_lines l
  using public.tubular_submissions s
  where l.submission_id = s.id and s.import_batch_id = p_batch_id;
  delete from public.tubular_submissions where import_batch_id = p_batch_id;

  update public.import_batches
    set status = 'rolled_back', rolled_back_at = now()
  where id = p_batch_id;
end;
$$;

revoke all on function public.rollback_import(uuid) from public;
revoke execute on function public.rollback_import(uuid) from anon;
grant execute on function public.rollback_import(uuid) to authenticated;
