-- ============================================================================
--  0016_tubular_records.sql — Tubular module: inventory records + submissions.
--  --------------------------------------------------------------------------
--  (PR 2 of the approved Tubular plan; numbered 0016 because 0015 is the
--  admin-allowlist migration already applied to the project.)
--
--  - tubular_records: the CURRENT snapshot — one row per unit-sheet line of
--    the workbook. A row's identity is its uuid, NEVER unit+description:
--    duplicate descriptions within a unit are real data (pup joints that
--    differ only by length in Remarks; Rig 202 duplicates DP/HWDP lines).
--    The authoritative workbook rules are baked in as GENERATED columns:
--       on_board       = coalesce(on_board_override, premium+class2+class3+scrap)
--       contract_delta = (premium + class2) - on_contract   -- Serviceable=P+C2;
--    render "OK" when contract_delta >= 0 (the O-column rule). Class 3, Scrap
--    and Needs Inspection can never count toward contract compliance because
--    the database computes the delta itself.
--    on_board_override exists ONLY for the 87 legacy workbook rows whose typed
--    On Board Total differs from the class sum; it is settable exclusively by
--    the import pipeline (a later migration) — submit_tubular_entry() does not
--    accept it, enforcing "On Board Total is not manually editable" at the
--    server, not the UI.
--  - tubular_submissions + lines: append-only audit of every batch save (the
--    Excel-style "save the sheet" action). Relational (not JSON snapshots) so
--    reconciliation reports can diff cell-level history with plain SQL.
--  - submit_tubular_entry(): the ONLY write path (SECURITY DEFINER, 0012
--    pattern). Records/submissions have no INSERT/UPDATE/DELETE policies.
-- ============================================================================

do $$ begin
  create type public.submission_source as enum
    ('data_entry', 'import', 'movement', 'adjustment');
exception when duplicate_object then null;
end $$;

-- ---- current snapshot ---------------------------------------------------------
create table if not exists public.tubular_records (
  id                  uuid primary key default gen_random_uuid(),
  unit_id             uuid not null references public.units(id) on delete restrict,
  catalog_item_id     uuid not null references public.tubular_catalog(id) on delete restrict,
  position            int  not null default 0,   -- sheet row order within the unit
  on_contract         int  not null default 0 check (on_contract >= 0),
  premium             int  not null default 0 check (premium >= 0),
  class2              int  not null default 0 check (class2 >= 0),
  class3              int  not null default 0 check (class3 >= 0),
  scrap               int  not null default 0 check (scrap >= 0),
  needs_inspection    int  not null default 0 check (needs_inspection >= 0),
  damaged_on_location int  not null default 0 check (damaged_on_location >= 0),
  send_to_repair      int  not null default 0 check (send_to_repair >= 0),
  to_other_rig        int  not null default 0 check (to_other_rig >= 0),
  receive_from_rig    int  not null default 0 check (receive_from_rig >= 0),
  on_board_override   int check (on_board_override >= 0),
  on_board            int generated always as
    (coalesce(on_board_override, premium + class2 + class3 + scrap)) stored,
  contract_delta      int generated always as
    ((premium + class2) - on_contract) stored,
  rental_date         date,
  remarks             text,
  archived            boolean not null default false,
  created_at          timestamptz not null default now(),
  created_by          uuid references auth.users(id),
  updated_at          timestamptz not null default now(),
  updated_by          uuid references auth.users(id)
);

create index if not exists tubular_records_unit_idx    on public.tubular_records (unit_id);
create index if not exists tubular_records_catalog_idx on public.tubular_records (catalog_item_id);

drop trigger if exists tubular_records_touch on public.tubular_records;
create trigger tubular_records_touch
  before update on public.tubular_records
  for each row execute function public.touch_updated_at();

alter table public.tubular_records enable row level security;

-- read: privileged / fleet viewers see all; unit viewers see assigned units.
drop policy if exists tubular_records_read on public.tubular_records;
create policy tubular_records_read on public.tubular_records
  for select to authenticated
  using (public.has_tubular_perm('view_fleet')
         or (public.has_tubular_perm('view')
             and unit_id in (select public.assigned_unit_ids())));
-- no write policies: submit_tubular_entry() (below) and the import/movement
-- RPCs (later migrations) are the only write paths.

-- ---- append-only submission audit ----------------------------------------------
create table if not exists public.tubular_submissions (
  id              uuid primary key default gen_random_uuid(),
  unit_id         uuid not null references public.units(id) on delete restrict,
  submitted_by    uuid not null references auth.users(id),
  submitted_at    timestamptz not null default now(),
  source          public.submission_source not null default 'data_entry',
  entry_date      date,          -- the sheet's "Date of Update"
  import_batch_id uuid,          -- FK added by the import migration
  note            text
);

create index if not exists tubular_submissions_unit_idx
  on public.tubular_submissions (unit_id, submitted_at desc);

create table if not exists public.tubular_submission_lines (
  id                  uuid primary key default gen_random_uuid(),
  submission_id       uuid not null references public.tubular_submissions(id) on delete cascade,
  record_id           uuid not null references public.tubular_records(id) on delete restrict,
  -- full copy of the saved state (post-save values) for cell-level history
  on_contract         int not null,
  premium             int not null,
  class2              int not null,
  class3              int not null,
  scrap               int not null,
  needs_inspection    int not null,
  damaged_on_location int not null,
  send_to_repair      int not null,
  to_other_rig        int not null,
  receive_from_rig    int not null,
  on_board_override   int,
  rental_date         date,
  remarks             text,
  archived            boolean not null default false
);

create index if not exists tubular_submission_lines_submission_idx
  on public.tubular_submission_lines (submission_id);
create index if not exists tubular_submission_lines_record_idx
  on public.tubular_submission_lines (record_id);

alter table public.tubular_submissions enable row level security;
alter table public.tubular_submission_lines enable row level security;

drop policy if exists tubular_submissions_read on public.tubular_submissions;
create policy tubular_submissions_read on public.tubular_submissions
  for select to authenticated
  using (public.has_tubular_perm('view_fleet')
         or (public.has_tubular_perm('view')
             and unit_id in (select public.assigned_unit_ids())));

drop policy if exists tubular_submission_lines_read on public.tubular_submission_lines;
create policy tubular_submission_lines_read on public.tubular_submission_lines
  for select to authenticated
  using (exists (select 1 from public.tubular_submissions s
                 where s.id = submission_id
                   and (public.has_tubular_perm('view_fleet')
                        or (public.has_tubular_perm('view')
                            and s.unit_id in (select public.assigned_unit_ids())))));
-- append-only: no insert/update/delete policies; rows written by RPCs only.

-- ---- batch save RPC (the Data Entry grid's Save) ---------------------------------
-- p_lines: jsonb array; each element:
--   { "id": uuid|null,            -- existing record to update, or null to insert
--     "catalog_item_id": uuid,
--     "position": int,
--     "on_contract": int, "premium": int, "class2": int, "class3": int,
--     "scrap": int, "needs_inspection": int, "damaged_on_location": int,
--     "send_to_repair": int, "to_other_rig": int, "receive_from_rig": int,
--     "rental_date": "YYYY-MM-DD"|null, "remarks": text|null }
-- p_archive_ids: records to archive (grid row deletions — never hard-deleted).
-- Returns: {"submission_id": uuid, "record_ids": [uuid, ...]}  (record_ids in
-- input order, so the client can adopt server ids for inserted rows).
-- Notes:
--   * on_board_override is deliberately NOT accepted — On Board is computed.
--   * malformed numeric/date values make jsonb_to_recordset raise, rolling
--     back the whole call: invalid input is never coerced or partially saved.
create or replace function public.submit_tubular_entry(
  p_unit_id     uuid,
  p_entry_date  date,
  p_lines       jsonb,
  p_archive_ids uuid[] default null,
  p_note        text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_submission_id uuid;
  v_record_ids    uuid[] := '{}';
  v_id            uuid;
  r               record;
begin
  -- NULL-safe guards (0012 pattern): permission AND unit assignment.
  if not public.has_tubular_perm('data_entry') then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if p_unit_id is null
     or p_unit_id not in (select public.assigned_unit_ids()) then
    raise exception 'not authorized for this unit' using errcode = '42501';
  end if;
  if p_lines is null or jsonb_typeof(p_lines) is distinct from 'array' then
    raise exception 'p_lines must be a json array' using errcode = '22023';
  end if;

  insert into public.tubular_submissions (unit_id, submitted_by, source, entry_date, note)
  values (p_unit_id, auth.uid(), 'data_entry', p_entry_date, p_note)
  returning id into v_submission_id;

  for r in
    select *
    from jsonb_to_recordset(p_lines) as x(
      id uuid, catalog_item_id uuid, position int,
      on_contract int, premium int, class2 int, class3 int, scrap int,
      needs_inspection int, damaged_on_location int, send_to_repair int,
      to_other_rig int, receive_from_rig int,
      rental_date date, remarks text)
  loop
    if r.catalog_item_id is null
       or not exists (select 1 from public.tubular_catalog c
                      where c.id = r.catalog_item_id and c.active) then
      raise exception 'unknown or inactive catalog item %', r.catalog_item_id
        using errcode = '23503';
    end if;

    if r.id is null then
      insert into public.tubular_records (
        unit_id, catalog_item_id, position,
        on_contract, premium, class2, class3, scrap,
        needs_inspection, damaged_on_location, send_to_repair,
        to_other_rig, receive_from_rig, rental_date, remarks,
        created_by, updated_by)
      values (
        p_unit_id, r.catalog_item_id, coalesce(r.position, 0),
        coalesce(r.on_contract, 0), coalesce(r.premium, 0), coalesce(r.class2, 0),
        coalesce(r.class3, 0), coalesce(r.scrap, 0),
        coalesce(r.needs_inspection, 0), coalesce(r.damaged_on_location, 0),
        coalesce(r.send_to_repair, 0), coalesce(r.to_other_rig, 0),
        coalesce(r.receive_from_rig, 0), r.rental_date, r.remarks,
        auth.uid(), auth.uid())
      returning id into v_id;
    else
      -- the record MUST belong to the unit being saved — a client cannot
      -- smuggle another unit's record id into its own batch.
      update public.tubular_records t set
        catalog_item_id     = r.catalog_item_id,
        position            = coalesce(r.position, t.position),
        on_contract         = coalesce(r.on_contract, 0),
        premium             = coalesce(r.premium, 0),
        class2              = coalesce(r.class2, 0),
        class3              = coalesce(r.class3, 0),
        scrap               = coalesce(r.scrap, 0),
        needs_inspection    = coalesce(r.needs_inspection, 0),
        damaged_on_location = coalesce(r.damaged_on_location, 0),
        send_to_repair      = coalesce(r.send_to_repair, 0),
        to_other_rig        = coalesce(r.to_other_rig, 0),
        receive_from_rig    = coalesce(r.receive_from_rig, 0),
        rental_date         = r.rental_date,
        remarks             = r.remarks,
        archived            = false,
        updated_by          = auth.uid()
      where t.id = r.id and t.unit_id = p_unit_id
      returning t.id into v_id;
      if v_id is null then
        raise exception 'record % does not belong to unit %', r.id, p_unit_id
          using errcode = '42501';
      end if;
    end if;

    v_record_ids := v_record_ids || v_id;
  end loop;

  -- archive removed rows (same unit-ownership rule; audit them too)
  if p_archive_ids is not null and array_length(p_archive_ids, 1) > 0 then
    if exists (select 1 from unnest(p_archive_ids) a
               left join public.tubular_records t on t.id = a
               where t.id is null or t.unit_id is distinct from p_unit_id) then
      raise exception 'archive list contains records not in unit %', p_unit_id
        using errcode = '42501';
    end if;
    update public.tubular_records
      set archived = true, updated_by = auth.uid()
    where id = any(p_archive_ids);
  end if;

  -- audit lines: post-save state of every touched record
  insert into public.tubular_submission_lines (
    submission_id, record_id,
    on_contract, premium, class2, class3, scrap, needs_inspection,
    damaged_on_location, send_to_repair, to_other_rig, receive_from_rig,
    on_board_override, rental_date, remarks, archived)
  select v_submission_id, t.id,
         t.on_contract, t.premium, t.class2, t.class3, t.scrap, t.needs_inspection,
         t.damaged_on_location, t.send_to_repair, t.to_other_rig, t.receive_from_rig,
         t.on_board_override, t.rental_date, t.remarks, t.archived
  from public.tubular_records t
  where t.id = any(v_record_ids || coalesce(p_archive_ids, '{}'));

  return jsonb_build_object(
    'submission_id', v_submission_id,
    'record_ids', to_jsonb(v_record_ids));
end;
$$;

revoke all on function public.submit_tubular_entry(uuid, date, jsonb, uuid[], text) from public;
revoke execute on function public.submit_tubular_entry(uuid, date, jsonb, uuid[], text) from anon;
grant execute on function public.submit_tubular_entry(uuid, date, jsonb, uuid[], text) to authenticated;
