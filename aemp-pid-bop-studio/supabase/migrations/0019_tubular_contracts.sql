-- ============================================================================
--  0019_tubular_contracts.sql — Tubular module: real contract records.
--  --------------------------------------------------------------------------
--  Replaces the prototype's runtime-generated demo contracts. A contract
--  belongs to a unit, carries required tubular lines, and drives compliance
--  as Σ serviceable (P+C2) vs line quantity — computed, never stored.
--  Deletion rules: only DRAFT contracts can be deleted; anything that has
--  been active is history and can only be archived (status), preserving the
--  audit trail. Writes are direct RLS-gated CRUD (single-row operations —
--  the documented exception to RPC-only writes), gated on manage_contracts.
--  Note: per approved plan, tubular_records.on_contract (imported per-row
--  value) remains authoritative for the row-level "Contractually Less"
--  display; contract lines are the forward-looking management view, and the
--  Contracts page surfaces drift between the two.
-- ============================================================================

create table if not exists public.tubular_contracts (
  id           uuid primary key default gen_random_uuid(),
  unit_id      uuid not null references public.units(id) on delete restrict,
  client       text not null default '',
  contract_ref text not null,
  start_date   date,
  end_date     date,
  status       text not null default 'draft'
    check (status in ('draft', 'active', 'expired', 'archived')),
  notes        text,
  created_by   uuid references auth.users(id) default auth.uid(),
  created_at   timestamptz not null default now(),
  updated_by   uuid references auth.users(id),
  updated_at   timestamptz not null default now(),
  constraint tubular_contracts_dates check (end_date is null or start_date is null or end_date >= start_date)
);

create index if not exists tubular_contracts_unit_idx on public.tubular_contracts (unit_id);

drop trigger if exists tubular_contracts_touch on public.tubular_contracts;
create trigger tubular_contracts_touch
  before update on public.tubular_contracts
  for each row execute function public.touch_updated_at();

create table if not exists public.tubular_contract_lines (
  id              uuid primary key default gen_random_uuid(),
  contract_id     uuid not null references public.tubular_contracts(id) on delete cascade,
  catalog_item_id uuid not null references public.tubular_catalog(id) on delete restrict,
  quantity        int not null check (quantity > 0),
  unique (contract_id, catalog_item_id)
);

alter table public.tubular_contracts enable row level security;
alter table public.tubular_contract_lines enable row level security;

drop policy if exists tubular_contracts_read on public.tubular_contracts;
create policy tubular_contracts_read on public.tubular_contracts
  for select to authenticated
  using (public.has_tubular_perm('view_fleet')
         or (public.has_tubular_perm('view')
             and unit_id in (select public.assigned_unit_ids())));

drop policy if exists tubular_contracts_insert on public.tubular_contracts;
create policy tubular_contracts_insert on public.tubular_contracts
  for insert to authenticated
  with check (public.has_tubular_perm('manage_contracts')
              and (created_by = auth.uid() or created_by is null));

drop policy if exists tubular_contracts_update on public.tubular_contracts;
create policy tubular_contracts_update on public.tubular_contracts
  for update to authenticated
  using (public.has_tubular_perm('manage_contracts'))
  with check (public.has_tubular_perm('manage_contracts'));

-- hard delete: DRAFTS only — active/expired/archived contracts are history
drop policy if exists tubular_contracts_delete on public.tubular_contracts;
create policy tubular_contracts_delete on public.tubular_contracts
  for delete to authenticated
  using (public.has_tubular_perm('manage_contracts') and status = 'draft');

drop policy if exists tubular_contract_lines_read on public.tubular_contract_lines;
create policy tubular_contract_lines_read on public.tubular_contract_lines
  for select to authenticated
  using (exists (select 1 from public.tubular_contracts c
                 where c.id = contract_id
                   and (public.has_tubular_perm('view_fleet')
                        or (public.has_tubular_perm('view')
                            and c.unit_id in (select public.assigned_unit_ids())))));

-- lines are editable only while the parent contract is draft/active; once a
-- contract is expired or archived its lines are immutable history.
drop policy if exists tubular_contract_lines_write on public.tubular_contract_lines;
create policy tubular_contract_lines_write on public.tubular_contract_lines
  for all to authenticated
  using (public.has_tubular_perm('manage_contracts')
         and exists (select 1 from public.tubular_contracts c
                     where c.id = contract_id and c.status in ('draft', 'active')))
  with check (public.has_tubular_perm('manage_contracts')
              and exists (select 1 from public.tubular_contracts c
                          where c.id = contract_id and c.status in ('draft', 'active')));
