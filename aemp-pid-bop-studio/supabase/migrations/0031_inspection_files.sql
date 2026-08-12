-- ============================================================================
--  0031_inspection_files.sql — per-record documentation files (6 kinds + other,
--  certificates carry an optional expiry_date that feeds alerts) and the
--  document Library bucket. Buckets are PRIVATE; access via signed URLs.
-- ============================================================================

do $$ begin
  create type public.insp_file_kind as enum
    ('oem_certificate','user_manual','spare_parts_manual','drawing',
     'inspection_certificate','major_inspection_certificate','other');
exception when duplicate_object then null; end $$;

insert into storage.buckets (id, name, public)
values ('inspection-files','inspection-files', false),
       ('inspection-library','inspection-library', false)
on conflict (id) do nothing;

create table if not exists public.insp_files (
  id           uuid primary key default gen_random_uuid(),
  record_id    uuid not null references public.insp_records(id) on delete cascade,
  kind         public.insp_file_kind not null default 'other',
  storage_path text not null unique,   -- records/<record_id>/<kind>/<file_name>
  file_name    text not null,
  file_size    bigint not null default 0,
  expiry_date  date,                   -- certificates only; null = no expiry
  uploaded_by  uuid not null default auth.uid() references auth.users(id),
  created_at   timestamptz not null default now()
);
create index if not exists insp_files_record_idx on public.insp_files(record_id);
create index if not exists insp_files_expiry_idx on public.insp_files(expiry_date);

alter table public.insp_files enable row level security;
drop policy if exists insp_files_read on public.insp_files;
create policy insp_files_read on public.insp_files
  for select to authenticated using (public.has_insp_perm('insp_view'));
drop policy if exists insp_files_write on public.insp_files;
create policy insp_files_write on public.insp_files
  for all to authenticated
  using (public.has_insp_perm('insp_manage_files'))
  with check (public.has_insp_perm('insp_manage_files'));

-- storage.objects policies for the two buckets
drop policy if exists insp_files_obj_read on storage.objects;
create policy insp_files_obj_read on storage.objects
  for select to authenticated
  using (bucket_id in ('inspection-files','inspection-library')
         and public.has_insp_perm('insp_view'));

drop policy if exists insp_files_obj_write on storage.objects;
create policy insp_files_obj_write on storage.objects
  for insert to authenticated
  with check (bucket_id in ('inspection-files','inspection-library')
              and public.has_insp_perm('insp_manage_files'));

drop policy if exists insp_files_obj_delete on storage.objects;
create policy insp_files_obj_delete on storage.objects
  for delete to authenticated
  using (bucket_id in ('inspection-files','inspection-library')
         and public.has_insp_perm('insp_manage_files'));
