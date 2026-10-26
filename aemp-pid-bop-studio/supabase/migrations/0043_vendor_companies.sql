-- ============================================================================
--  0043 — Vendor Companies, mirroring the reference `/vendor-companies` module:
--  the OEM / inspection / certifying company names offered on the inspection
--  and calibration forms, plus a cache of API MyCerts certification look-ups.
--
--    1. permissions insp_vendor_view (the screen) / insp_vendor_edit
--    2. insp_vendor_companies — name unique ignoring case/space; source
--       Manual | Imported; inactive names stay but are not suggested
--    3. insp_vendor_search()  — name suggestions (prefix first, then contains)
--    4. insp_mycerts_cache    — last good MyCerts answer per query, so the
--       `mycerts` edge function can serve a stale result when MyCerts is down
--  Suggestions are readable by anyone with insp_view (they fill form fields).
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
    'insp_calibration_view','insp_calibration_edit',
    'insp_vendor_view','insp_vendor_edit'
  ));

-- ---- 2) vendor companies ---------------------------------------------------------
create table if not exists public.insp_vendor_companies (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (length(btrim(name)) between 1 and 300),
  source     text not null default 'Manual' check (source in ('Manual','Imported')),
  is_active  boolean not null default true,
  created_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- ~4.6k rows: a plain ILIKE scan is cheap, so no trigram index (pg_trgm is not installed).
create unique index if not exists insp_vendor_companies_name_key
  on public.insp_vendor_companies (lower(btrim(name)));
drop trigger if exists insp_vendor_companies_touch on public.insp_vendor_companies;
create trigger insp_vendor_companies_touch before update on public.insp_vendor_companies
  for each row execute function public.touch_updated_at();

alter table public.insp_vendor_companies enable row level security;
drop policy if exists insp_vendor_read on public.insp_vendor_companies;
create policy insp_vendor_read on public.insp_vendor_companies for select to authenticated
  using (public.has_insp_perm('insp_view') or public.has_insp_perm('insp_vendor_view'));
drop policy if exists insp_vendor_write on public.insp_vendor_companies;
create policy insp_vendor_write on public.insp_vendor_companies for all to authenticated
  using (public.has_insp_perm('insp_vendor_edit'))
  with check (public.has_insp_perm('insp_vendor_edit'));

-- ---- 3) suggestions ----------------------------------------------------------------
create or replace function public.insp_vendor_search(p_q text, p_limit int default 20, p_offset int default 0)
returns table (id uuid, name text)
language sql stable security invoker set search_path = public as $$
  select v.id, v.name from public.insp_vendor_companies v
  where v.is_active
    and (coalesce(btrim(p_q), '') = '' or v.name ilike '%' || btrim(p_q) || '%')
  order by (v.name ilike btrim(coalesce(p_q, '')) || '%') desc, lower(v.name)
  limit least(greatest(p_limit, 1), 100) offset greatest(p_offset, 0)
$$;
revoke all on function public.insp_vendor_search(text, int, int) from public, anon;
grant execute on function public.insp_vendor_search(text, int, int) to authenticated;

-- ---- 4) MyCerts cache (written only by the edge function's service role) ---------------
create table if not exists public.insp_mycerts_cache (
  query_key  text primary key,          -- lower(trim(name)) | exact | page
  payload    jsonb not null,
  fetched_at timestamptz not null default now()
);
alter table public.insp_mycerts_cache enable row level security;
-- No policies: clients never read or write it directly.
