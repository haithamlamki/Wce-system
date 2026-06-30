-- ============================================================================
--  Rig manuals (FR — admin uploads/removes manuals; end users view + download).
--  Metadata table + a private Storage bucket. Authenticated users may read/
--  download; only admins/managers (is_privileged) may write/delete.
-- ============================================================================

create table if not exists public.manuals (
  id uuid primary key default gen_random_uuid(),
  rig_name text,                       -- null = global manual
  title text not null,
  path text not null,                  -- object path within the 'manuals' bucket
  mime text,
  size integer,
  uploaded_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
alter table public.manuals enable row level security;

drop policy if exists manuals_read on public.manuals;
drop policy if exists manuals_admin_write on public.manuals;
create policy manuals_read on public.manuals for select to authenticated using (true);
create policy manuals_admin_write on public.manuals for all to authenticated
  using (public.is_privileged()) with check (public.is_privileged());

-- private storage bucket
insert into storage.buckets (id, name, public) values ('manuals', 'manuals', false)
  on conflict (id) do nothing;

drop policy if exists manuals_obj_read on storage.objects;
drop policy if exists manuals_obj_write on storage.objects;
drop policy if exists manuals_obj_delete on storage.objects;
create policy manuals_obj_read on storage.objects for select to authenticated
  using (bucket_id = 'manuals');
create policy manuals_obj_write on storage.objects for insert to authenticated
  with check (bucket_id = 'manuals' and public.is_privileged());
create policy manuals_obj_delete on storage.objects for delete to authenticated
  using (bucket_id = 'manuals' and public.is_privileged());
