-- ============================================================================
--  0054 — MOH planner gaps vs the standalone HTML:
--    1. insp_moh_projects.estimated_cost — per-year project budget
--    2. insp_moh_rig_meta — per-rig planner details the units table lacks:
--       location, budget currency, report "prepared by" and report remarks.
--       (Client comes from units.description; rig model / HP from unit_specs.)
--  Rig rows are scoped exactly like the other MOH rig tables (insp_unit_ids()).
-- ============================================================================

alter table public.insp_moh_projects
  add column if not exists estimated_cost numeric
    check (estimated_cost is null or estimated_cost >= 0);

create table if not exists public.insp_moh_rig_meta (
  unit_id     uuid primary key references public.units(id) on delete cascade,
  location    text not null default '' check (char_length(location) <= 120),
  currency    text not null default 'OMR' check (currency in ('OMR','USD','SAR','AED','EUR','GBP')),
  prepared_by text not null default '' check (char_length(prepared_by) <= 120),
  remarks     text not null default '' check (char_length(remarks) <= 4000),
  updated_by  uuid references auth.users(id) default auth.uid(),
  updated_at  timestamptz not null default now()
);
drop trigger if exists insp_moh_rig_meta_touch on public.insp_moh_rig_meta;
create trigger insp_moh_rig_meta_touch before update on public.insp_moh_rig_meta
  for each row execute function public.touch_updated_at();

alter table public.insp_moh_rig_meta enable row level security;
drop policy if exists insp_moh_rig_meta_read on public.insp_moh_rig_meta;
create policy insp_moh_rig_meta_read on public.insp_moh_rig_meta for select to authenticated
  using (public.has_insp_perm('moh:view') and unit_id in (select public.insp_unit_ids()));
drop policy if exists insp_moh_rig_meta_write on public.insp_moh_rig_meta;
create policy insp_moh_rig_meta_write on public.insp_moh_rig_meta for all to authenticated
  using (public.has_insp_perm('moh:update') and unit_id in (select public.insp_unit_ids()))
  with check (public.has_insp_perm('moh:update') and unit_id in (select public.insp_unit_ids()));

grant select, insert, update, delete on public.insp_moh_rig_meta to authenticated;
