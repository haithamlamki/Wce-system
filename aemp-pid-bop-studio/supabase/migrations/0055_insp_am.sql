-- ============================================================================
--  0055 — Annual Maintenance (AM) plans, replacing the per-rig
--  "Maintenance Plan - Gantt Chart" Excel workbook with database-backed data.
--
--    1. permissions am:view / am:update (granted to roles holding dashboard:view)
--    2. insp_am_contracts — per-rig contract terms for the AM window: allowed
--                           days, how the rig is paid while down (full /
--                           reduced / breakdown rate %), over-run rate, daily
--                           rate, CAT IV cycle and last CAT IV date
--    3. insp_am_plans     — one AM per rig (e.g. "Rig305 AM-2026"): planned and
--                           actual window, a snapshot of the contract terms,
--                           revision counter, finalized flag
--    4. insp_am_items     — the equipment lines (section, CAT, interval,
--                           applicability, responsible, dates, status)
--    5. insp_am_tasks     — each line's scope-of-work checklist (done flags)
--    6. insp_am_revisions — one row per Excel import, so every re-issue of the
--                           sheet up to day zero is on record
--    7. insp_am_import()  — atomic re-import of a plan's items + tasks
--  Rig rows are scoped exactly like insp_records (insp_unit_ids()).
-- ============================================================================

-- ---- 1) permissions ------------------------------------------------------------
insert into public.insp_permissions (key, resource, action) values
  ('am:view', 'am', 'view'), ('am:update', 'am', 'update')
on conflict (key) do nothing;

insert into public.insp_role_permissions (role_id, permission_key)
select distinct rp.role_id, 'am:view' from public.insp_role_permissions rp
where rp.permission_key = 'dashboard:view'
on conflict do nothing;

-- ---- 2) per-rig contract terms --------------------------------------------------
create table if not exists public.insp_am_contracts (
  unit_id              uuid primary key references public.units(id) on delete cascade,
  client               text not null default '' check (char_length(client) <= 120),
  contract_ref         text not null default '' check (char_length(contract_ref) <= 120),
  am_days_allowed      integer not null default 5 check (am_days_allowed between 0 and 90),
  -- full = paid at the operating rate; reduced / breakdown = paid at rate_percent
  rate_basis           text not null default 'full' check (rate_basis in ('full','reduced','breakdown')),
  rate_percent         numeric not null default 100 check (rate_percent between 0 and 100),
  -- days beyond the allowance, as % of the daily rate (often 0 = zero rate)
  overrun_rate_percent numeric not null default 0 check (overrun_rate_percent between 0 and 100),
  daily_rate           numeric check (daily_rate is null or daily_rate >= 0),
  currency             text not null default 'OMR' check (currency in ('OMR','USD','SAR','AED','EUR','GBP')),
  cat_iv_cycle_years   integer not null default 10 check (cat_iv_cycle_years between 1 and 30),
  last_cat_iv_date     date,
  notes                text not null default '' check (char_length(notes) <= 4000),
  updated_by           uuid references auth.users(id) default auth.uid(),
  updated_at           timestamptz not null default now()
);
drop trigger if exists insp_am_contracts_touch on public.insp_am_contracts;
create trigger insp_am_contracts_touch before update on public.insp_am_contracts
  for each row execute function public.touch_updated_at();

-- ---- 3) plans --------------------------------------------------------------------
create table if not exists public.insp_am_plans (
  id                   uuid primary key default gen_random_uuid(),
  unit_id              uuid not null references public.units(id) on delete cascade,
  title                text not null check (btrim(title) <> '' and char_length(title) <= 120),
  plan_year            integer not null check (plan_year between 2000 and 2200),
  status               text not null default 'Planning'
                         check (status in ('Planning','In Progress','Completed','Cancelled')),
  planned_start        date,
  planned_end          date,
  actual_start         date,
  actual_end           date,
  -- contract snapshot (copied from insp_am_contracts when the plan is created)
  allowed_days         integer not null default 5 check (allowed_days between 0 and 90),
  rate_basis           text not null default 'full' check (rate_basis in ('full','reduced','breakdown')),
  rate_percent         numeric not null default 100 check (rate_percent between 0 and 100),
  overrun_rate_percent numeric not null default 0 check (overrun_rate_percent between 0 and 100),
  daily_rate           numeric check (daily_rate is null or daily_rate >= 0),
  currency             text not null default 'OMR' check (currency in ('OMR','USD','SAR','AED','EUR','GBP')),
  includes_cat_iv      boolean not null default false,
  notes                text not null default '' check (char_length(notes) <= 4000),
  revision             integer not null default 0,
  source_file          text not null default '',
  last_imported_at     timestamptz,
  finalized_at         timestamptz,
  finalized_by         uuid references auth.users(id),
  created_by           uuid references auth.users(id) default auth.uid(),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  check (planned_end is null or planned_start is null or planned_end >= planned_start),
  check (actual_end is null or actual_start is null or actual_end >= actual_start)
);
create unique index if not exists insp_am_plans_title on public.insp_am_plans (unit_id, lower(btrim(title)));
create index if not exists insp_am_plans_year on public.insp_am_plans (plan_year);
drop trigger if exists insp_am_plans_touch on public.insp_am_plans;
create trigger insp_am_plans_touch before update on public.insp_am_plans
  for each row execute function public.touch_updated_at();

-- ---- 4) equipment lines ----------------------------------------------------------
create table if not exists public.insp_am_items (
  id            uuid primary key default gen_random_uuid(),
  plan_id       uuid not null references public.insp_am_plans(id) on delete cascade,
  sort_order    integer not null,
  sn            integer,
  section       text not null default 'OTHER' check (char_length(section) <= 60),
  description   text not null check (btrim(description) <> ''),
  category      text not null default '' check (char_length(category) <= 40),
  interval_text text not null default '' check (char_length(interval_text) <= 60),
  applicability text not null default 'Applicable'
                  check (applicability in ('Applicable','Not applicable','Completed Offline')),
  responsible   text not null default '' check (char_length(responsible) <= 120),
  start_date    date,
  end_date      date,
  status        text not null default 'Not Started'
                  check (status in ('Not Started','In Progress','Completed','Not applicable')),
  comments      text not null default '' check (char_length(comments) <= 2000),
  gantt_seq     integer,
  updated_at    timestamptz not null default now()
);
create index if not exists insp_am_items_plan on public.insp_am_items (plan_id, sort_order);
drop trigger if exists insp_am_items_touch on public.insp_am_items;
create trigger insp_am_items_touch before update on public.insp_am_items
  for each row execute function public.touch_updated_at();

-- ---- 5) scope-of-work checklist ---------------------------------------------------
create table if not exists public.insp_am_tasks (
  id          uuid primary key default gen_random_uuid(),
  item_id     uuid not null references public.insp_am_items(id) on delete cascade,
  seq         integer not null,
  description text not null check (btrim(description) <> ''),
  done        boolean not null default false,
  done_by     uuid references auth.users(id),
  done_at     timestamptz
);
create index if not exists insp_am_tasks_item on public.insp_am_tasks (item_id, seq);

-- ---- 6) import history ------------------------------------------------------------
create table if not exists public.insp_am_revisions (
  id          uuid primary key default gen_random_uuid(),
  plan_id     uuid not null references public.insp_am_plans(id) on delete cascade,
  revision    integer not null,
  file_name   text not null default '',
  summary     jsonb not null default '{}'::jsonb,
  imported_by uuid references auth.users(id) default auth.uid(),
  imported_at timestamptz not null default now()
);
create index if not exists insp_am_revisions_plan on public.insp_am_revisions (plan_id, revision desc);

-- ---- RLS ---------------------------------------------------------------------------
alter table public.insp_am_contracts enable row level security;
alter table public.insp_am_plans     enable row level security;
alter table public.insp_am_items     enable row level security;
alter table public.insp_am_tasks     enable row level security;
alter table public.insp_am_revisions enable row level security;

do $$ declare t text; begin
  foreach t in array array['insp_am_contracts','insp_am_plans'] loop
    execute format('drop policy if exists %I on public.%I', t || '_read', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.has_insp_perm(''am:view'') and unit_id in (select public.insp_unit_ids()))', t || '_read', t);
    execute format('drop policy if exists %I on public.%I', t || '_write', t);
    execute format('create policy %I on public.%I for all to authenticated using (public.has_insp_perm(''am:update'') and unit_id in (select public.insp_unit_ids())) with check (public.has_insp_perm(''am:update'') and unit_id in (select public.insp_unit_ids()))', t || '_write', t);
  end loop;
end $$;

-- Child rows follow their plan's scope (the plan subquery is itself RLS-filtered).
drop policy if exists insp_am_items_read on public.insp_am_items;
create policy insp_am_items_read on public.insp_am_items for select to authenticated
  using (plan_id in (select id from public.insp_am_plans));
drop policy if exists insp_am_items_write on public.insp_am_items;
create policy insp_am_items_write on public.insp_am_items for all to authenticated
  using (public.has_insp_perm('am:update') and plan_id in (select id from public.insp_am_plans))
  with check (public.has_insp_perm('am:update') and plan_id in (select id from public.insp_am_plans));

drop policy if exists insp_am_tasks_read on public.insp_am_tasks;
create policy insp_am_tasks_read on public.insp_am_tasks for select to authenticated
  using (item_id in (select id from public.insp_am_items));
drop policy if exists insp_am_tasks_write on public.insp_am_tasks;
create policy insp_am_tasks_write on public.insp_am_tasks for all to authenticated
  using (public.has_insp_perm('am:update') and item_id in (select id from public.insp_am_items))
  with check (public.has_insp_perm('am:update') and item_id in (select id from public.insp_am_items));

drop policy if exists insp_am_revisions_read on public.insp_am_revisions;
create policy insp_am_revisions_read on public.insp_am_revisions for select to authenticated
  using (plan_id in (select id from public.insp_am_plans));
drop policy if exists insp_am_revisions_write on public.insp_am_revisions;
create policy insp_am_revisions_write on public.insp_am_revisions for insert to authenticated
  with check (public.has_insp_perm('am:update') and plan_id in (select id from public.insp_am_plans));

grant select, insert, update, delete on public.insp_am_contracts, public.insp_am_plans,
  public.insp_am_items, public.insp_am_tasks to authenticated;
grant select, insert on public.insp_am_revisions to authenticated;

-- A finalized plan is frozen: its lines and checklist cannot change until reopened.
-- (When a whole plan is deleted the cascade runs after the plan row is gone, so
-- the guard finds no finalized parent and lets the children go.)
create or replace function public.insp_am_guard_finalized() returns trigger
language plpgsql set search_path = public as $$
declare pid uuid;
begin
  if tg_table_name = 'insp_am_items' then
    pid := case when tg_op = 'DELETE' then old.plan_id else new.plan_id end;
  else
    select i.plan_id into pid from public.insp_am_items i
     where i.id = case when tg_op = 'DELETE' then old.item_id else new.item_id end;
  end if;
  if exists (select 1 from public.insp_am_plans p where p.id = pid and p.finalized_at is not null) then
    raise exception 'This maintenance plan is finalized; reopen it before making changes.';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;
drop trigger if exists insp_am_items_guard on public.insp_am_items;
create trigger insp_am_items_guard before insert or update or delete on public.insp_am_items
  for each row execute function public.insp_am_guard_finalized();
drop trigger if exists insp_am_tasks_guard on public.insp_am_tasks;
create trigger insp_am_tasks_guard before insert or update or delete on public.insp_am_tasks
  for each row execute function public.insp_am_guard_finalized();

-- ---- per-plan progress (the dashboard list) -------------------------------------
-- Same rule as lib/am.ts and the workbook's Overall Progress formula: average
-- line progress over lines that are not "Not applicable", where a
-- "Completed Offline" line counts as done and otherwise the checklist ratio.
-- security_invoker: rows are limited by the caller's RLS on the base tables.
create or replace view public.insp_am_plan_summary with (security_invoker = true) as
with lines as (
  select i.plan_id, i.status,
         case when i.applicability = 'Completed Offline' then 1.0
              when count(t.id) > 0 then avg(case when t.done then 1.0 else 0.0 end)
              when i.status = 'Completed' then 1.0 else 0.0 end as progress,
         (i.status = 'Not applicable' or i.applicability = 'Not applicable') as na
  from public.insp_am_items i
  left join public.insp_am_tasks t on t.item_id = i.id
  group by i.id
)
select plan_id,
       count(*) filter (where not na)::int                                  as active,
       count(*) filter (where not na and status = 'Completed')::int         as completed,
       count(*) filter (where not na and status = 'In Progress')::int       as in_progress,
       count(*) filter (where not na and status not in ('Completed','In Progress'))::int as not_started,
       count(*) filter (where na)::int                                      as not_applicable,
       coalesce(avg(progress) filter (where not na), 0)::float8             as progress
from lines group by plan_id;
grant select on public.insp_am_plan_summary to authenticated;

-- ---- 7) atomic import -------------------------------------------------------------
-- p: { unit_id, title, plan_year, planned_start, planned_end, file_name, summary,
--      items: [{ sn, section, description, category, interval_text, applicability,
--                responsible, start_date, end_date, status, comments, gantt_seq,
--                tasks: [{ seq, description, done }] }] }
-- Creates the plan (contract terms copied in) or replaces an existing,
-- non-finalized plan's lines + checklist, bumps the revision and logs it.
-- SECURITY INVOKER: every write goes through the RLS policies above.
create or replace function public.insp_am_import(p jsonb) returns uuid
language plpgsql security invoker set search_path = public as $$
declare
  v_unit uuid := (p->>'unit_id')::uuid;
  v_title text := btrim(coalesce(p->>'title', ''));
  v_plan public.insp_am_plans%rowtype;
  v_item jsonb; v_task jsonb; v_item_id uuid; v_order integer := 0;
  c public.insp_am_contracts%rowtype;
begin
  if not public.has_insp_perm('am:update') or v_unit not in (select public.insp_unit_ids()) then
    raise exception 'You do not have permission to import maintenance plans for this rig.';
  end if;
  if v_title = '' then raise exception 'The plan needs a project name.'; end if;
  if jsonb_typeof(p->'items') is distinct from 'array' or jsonb_array_length(p->'items') = 0 then
    raise exception 'The plan has no equipment lines.';
  end if;
  if jsonb_array_length(p->'items') > 2000 then raise exception 'Too many equipment lines (max 2,000).'; end if;

  select * into v_plan from public.insp_am_plans
   where unit_id = v_unit and lower(btrim(title)) = lower(v_title) for update;

  if found then
    if v_plan.finalized_at is not null then
      raise exception 'Plan "%" is finalized; reopen it before importing a new revision.', v_plan.title;
    end if;
    delete from public.insp_am_items where plan_id = v_plan.id;
    update public.insp_am_plans set
      plan_year = coalesce((p->>'plan_year')::int, plan_year),
      planned_start = (p->>'planned_start')::date, planned_end = (p->>'planned_end')::date,
      revision = revision + 1, source_file = left(coalesce(p->>'file_name', ''), 255),
      last_imported_at = now()
    where id = v_plan.id returning * into v_plan;
  else
    select * into c from public.insp_am_contracts where unit_id = v_unit;
    insert into public.insp_am_plans (unit_id, title, plan_year, planned_start, planned_end,
      allowed_days, rate_basis, rate_percent, overrun_rate_percent, daily_rate, currency,
      revision, source_file, last_imported_at)
    values (v_unit, v_title, (p->>'plan_year')::int, (p->>'planned_start')::date, (p->>'planned_end')::date,
      coalesce(c.am_days_allowed, 5), coalesce(c.rate_basis, 'full'), coalesce(c.rate_percent, 100),
      coalesce(c.overrun_rate_percent, 0), c.daily_rate, coalesce(c.currency, 'OMR'),
      1, left(coalesce(p->>'file_name', ''), 255), now())
    returning * into v_plan;
  end if;

  for v_item in select * from jsonb_array_elements(p->'items') loop
    v_order := v_order + 1;
    insert into public.insp_am_items (plan_id, sort_order, sn, section, description, category, interval_text,
      applicability, responsible, start_date, end_date, status, comments, gantt_seq)
    values (v_plan.id, v_order, (v_item->>'sn')::int, coalesce(nullif(v_item->>'section', ''), 'OTHER'),
      v_item->>'description', coalesce(v_item->>'category', ''), coalesce(v_item->>'interval_text', ''),
      coalesce(v_item->>'applicability', 'Applicable'), coalesce(v_item->>'responsible', ''),
      (v_item->>'start_date')::date, (v_item->>'end_date')::date,
      coalesce(v_item->>'status', 'Not Started'), coalesce(v_item->>'comments', ''), (v_item->>'gantt_seq')::int)
    returning id into v_item_id;
    if jsonb_typeof(v_item->'tasks') = 'array' then
      for v_task in select * from jsonb_array_elements(v_item->'tasks') loop
        insert into public.insp_am_tasks (item_id, seq, description, done, done_at)
        values (v_item_id, (v_task->>'seq')::int, v_task->>'description', coalesce((v_task->>'done')::boolean, false),
          case when coalesce((v_task->>'done')::boolean, false) then now() end);
      end loop;
    end if;
  end loop;

  insert into public.insp_am_revisions (plan_id, revision, file_name, summary)
  values (v_plan.id, v_plan.revision, v_plan.source_file, coalesce(p->'summary', '{}'::jsonb));
  return v_plan.id;
end $$;
revoke all on function public.insp_am_import(jsonb) from public, anon;
grant execute on function public.insp_am_import(jsonb) to authenticated;
