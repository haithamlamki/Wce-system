-- ============================================================================
--  0048 — Shared Documents (reference `/inspection/shared-documents`):
--  a named document set uploaded once against one or more rigs and linked to
--  many inspection records on those rigs. Files are grouped by category.
--    · insp_document_sets        name / description / creator
--    · insp_document_set_units   rigs sharing the set (≥1)
--    · insp_document_set_files   files (bucket inspection-files, shared/<set>/…)
--    · insp_document_set_links   set ↔ inspection record
--  A set is visible when any of its rigs is in the caller's scope and
--  manageable when all of them are (reference canManage / rigs[].inScope).
-- ============================================================================
create table if not exists public.insp_document_sets (
  id              uuid primary key default gen_random_uuid(),
  name            text not null check (char_length(btrim(name)) between 1 and 255),
  description     text check (description is null or char_length(description) <= 500),
  created_by      uuid default auth.uid() references auth.users(id) on delete set null,
  created_by_name text,
  created_at      timestamptz not null default now(),
  source_id       integer unique
);
create table if not exists public.insp_document_set_units (
  set_id  uuid not null references public.insp_document_sets(id) on delete cascade,
  unit_id uuid not null references public.units(id) on delete cascade,
  primary key (set_id, unit_id)
);
create index if not exists insp_document_set_units_unit on public.insp_document_set_units(unit_id);
create table if not exists public.insp_document_set_files (
  id           uuid primary key default gen_random_uuid(),
  set_id       uuid not null references public.insp_document_sets(id) on delete cascade,
  category     text check (category is null or char_length(category) <= 255),
  storage_path text not null unique,
  file_name    text not null,
  file_size    bigint not null default 0,
  uploaded_by  uuid default auth.uid() references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  source_id    integer unique
);
create index if not exists insp_document_set_files_set on public.insp_document_set_files(set_id);
create table if not exists public.insp_document_set_links (
  set_id     uuid not null references public.insp_document_sets(id) on delete cascade,
  record_id  uuid not null references public.insp_records(id) on delete cascade,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (set_id, record_id)
);
create index if not exists insp_document_set_links_record on public.insp_document_set_links(record_id);

-- ---- scope helpers -------------------------------------------------------------
create or replace function public.insp_doc_set_visible(p_set uuid) returns boolean
  language sql security definer stable set search_path = public as
$$ select exists (select 1 from public.insp_document_set_units su
                  where su.set_id = p_set and su.unit_id in (select public.insp_unit_ids())) $$;

create or replace function public.insp_doc_set_manageable(p_set uuid) returns boolean
  language sql security definer stable set search_path = public as
$$ select exists (select 1 from public.insp_document_set_units where set_id = p_set)
      and not exists (select 1 from public.insp_document_set_units su
                      where su.set_id = p_set and su.unit_id not in (select public.insp_unit_ids())) $$;

-- Record on one of the set's rigs and inside the caller's scope (link writes).
create or replace function public.insp_doc_set_can_link(p_set uuid, p_record uuid) returns boolean
  language sql security definer stable set search_path = public as
$$ select exists (select 1 from public.insp_records r
                    join public.insp_document_set_units su on su.unit_id = r.unit_id and su.set_id = p_set
                   where r.id = p_record and r.unit_id in (select public.insp_unit_ids())) $$;

-- ---- RLS ---------------------------------------------------------------------------
alter table public.insp_document_sets enable row level security;
alter table public.insp_document_set_units enable row level security;
alter table public.insp_document_set_files enable row level security;
alter table public.insp_document_set_links enable row level security;

drop policy if exists insp_doc_sets_read on public.insp_document_sets;
create policy insp_doc_sets_read on public.insp_document_sets for select to authenticated
  using (public.has_insp_perm('shared-document:view') and public.insp_doc_set_visible(id));
drop policy if exists insp_doc_sets_update on public.insp_document_sets;
create policy insp_doc_sets_update on public.insp_document_sets for update to authenticated
  using (public.has_insp_perm('shared-document:create') and public.insp_doc_set_manageable(id));
drop policy if exists insp_doc_sets_delete on public.insp_document_sets;
create policy insp_doc_sets_delete on public.insp_document_sets for delete to authenticated
  using (public.has_insp_perm('shared-document:delete') and public.insp_doc_set_manageable(id));

drop policy if exists insp_doc_set_units_read on public.insp_document_set_units;
create policy insp_doc_set_units_read on public.insp_document_set_units for select to authenticated
  using (public.has_insp_perm('shared-document:view') and public.insp_doc_set_visible(set_id));

drop policy if exists insp_doc_set_files_read on public.insp_document_set_files;
create policy insp_doc_set_files_read on public.insp_document_set_files for select to authenticated
  using ((public.has_insp_perm('shared-document:view') or public.has_insp_perm('inspection:view'))
         and public.insp_doc_set_visible(set_id));
drop policy if exists insp_doc_set_files_insert on public.insp_document_set_files;
create policy insp_doc_set_files_insert on public.insp_document_set_files for insert to authenticated
  with check (public.has_insp_perm('shared-document:create') and public.insp_doc_set_manageable(set_id));
drop policy if exists insp_doc_set_files_delete on public.insp_document_set_files;
create policy insp_doc_set_files_delete on public.insp_document_set_files for delete to authenticated
  using (public.has_insp_perm('shared-document:delete') and public.insp_doc_set_manageable(set_id));

drop policy if exists insp_doc_set_links_read on public.insp_document_set_links;
create policy insp_doc_set_links_read on public.insp_document_set_links for select to authenticated
  using ((public.has_insp_perm('shared-document:view') or public.has_insp_perm('inspection:view'))
         and public.insp_doc_set_visible(set_id));
drop policy if exists insp_doc_set_links_insert on public.insp_document_set_links;
create policy insp_doc_set_links_insert on public.insp_document_set_links for insert to authenticated
  with check (public.has_insp_perm('shared-document:create') and public.insp_doc_set_can_link(set_id, record_id));
drop policy if exists insp_doc_set_links_delete on public.insp_document_set_links;
create policy insp_doc_set_links_delete on public.insp_document_set_links for delete to authenticated
  using (public.has_insp_perm('shared-document:delete') and public.insp_doc_set_can_link(set_id, record_id));

-- ---- RPCs ------------------------------------------------------------------------------
-- List rows (reference /shared-documents/search): rigName, documentCount, linkedRecordCount, canManage.
create or replace function public.insp_document_sets_list() returns jsonb
  language sql security invoker stable set search_path = public as
$$ select coalesce(jsonb_agg(jsonb_build_object(
      'id', s.id, 'name', s.name, 'description', s.description,
      'createdBy', s.created_by_name, 'created', s.created_at,
      'rigName', (select string_agg(u.name, ', ' order by u.name) from public.insp_document_set_units su
                    join public.units u on u.id = su.unit_id where su.set_id = s.id),
      'documentCount', (select count(*) from public.insp_document_set_files f where f.set_id = s.id),
      'linkedRecordCount', (select count(*) from public.insp_document_set_links l where l.set_id = s.id),
      'canManage', public.insp_doc_set_manageable(s.id)) order by s.created_at desc), '[]'::jsonb)
   from public.insp_document_sets s $$;

-- Detail (reference GET /shared-documents/{id}).
create or replace function public.insp_document_set_detail(p_id uuid) returns jsonb
  language sql security invoker stable set search_path = public as
$$ select jsonb_build_object(
      'id', s.id, 'name', s.name, 'description', s.description,
      'createdBy', s.created_by_name, 'created', s.created_at,
      'canManage', public.insp_doc_set_manageable(s.id),
      'rigs', (select coalesce(jsonb_agg(jsonb_build_object(
                  'unitId', u.id, 'unitName', u.name,
                  'inScope', u.id in (select public.insp_unit_ids()),
                  'linkedRecordCount', (select count(*) from public.insp_document_set_links l
                                          join public.insp_records r on r.id = l.record_id
                                         where l.set_id = s.id and r.unit_id = u.id)) order by u.name), '[]'::jsonb)
               from public.insp_document_set_units su join public.units u on u.id = su.unit_id
              where su.set_id = s.id),
      'documents', (select coalesce(jsonb_agg(jsonb_build_object(
                  'id', f.id, 'fileName', f.file_name, 'size', f.file_size,
                  'category', f.category, 'storagePath', f.storage_path) order by f.file_name), '[]'::jsonb)
               from public.insp_document_set_files f where f.set_id = s.id),
      'linkedInspectionIds', (select coalesce(jsonb_agg(l.record_id), '[]'::jsonb)
               from public.insp_document_set_links l where l.set_id = s.id))
   from public.insp_document_sets s where s.id = p_id $$;

-- Sets linked to one record, with their files (reference GET /records/{id}/shared-documents).
create or replace function public.insp_record_shared_documents(p_record uuid) returns jsonb
  language sql security invoker stable set search_path = public as
$$ select coalesce(jsonb_agg(jsonb_build_object(
      'id', s.id, 'name', s.name, 'description', s.description,
      'documents', (select coalesce(jsonb_agg(jsonb_build_object(
                      'id', f.id, 'fileName', f.file_name, 'size', f.file_size,
                      'category', f.category, 'storagePath', f.storage_path) order by f.file_name), '[]'::jsonb)
                    from public.insp_document_set_files f where f.set_id = s.id)) order by s.name), '[]'::jsonb)
   from public.insp_document_set_links l join public.insp_document_sets s on s.id = l.set_id
  where l.record_id = p_record $$;

-- Create a set with its rigs (files are uploaded by the client afterwards).
create or replace function public.insp_document_set_create(p_name text, p_description text, p_unit_ids uuid[])
returns uuid language plpgsql security definer set search_path = public as
$$
declare v_id uuid; v_who text;
begin
  if not public.has_insp_perm('shared-document:create') then
    raise exception 'permission denied: shared-document:create required';
  end if;
  if coalesce(array_length(p_unit_ids, 1), 0) = 0 then raise exception 'At least one rig is required'; end if;
  if exists (select 1 from unnest(p_unit_ids) x where x not in (select public.insp_unit_ids())) then
    raise exception 'One or more rigs are outside your scope';
  end if;
  select coalesce(nullif(btrim(full_name), ''), email) into v_who from public.profiles where id = auth.uid();
  insert into public.insp_document_sets (name, description, created_by_name)
  values (btrim(p_name), nullif(btrim(coalesce(p_description, '')), ''), v_who) returning id into v_id;
  insert into public.insp_document_set_units (set_id, unit_id) select distinct v_id, x from unnest(p_unit_ids) x;
  return v_id;
end $$;

-- Replace a set's rigs; links to records on removed rigs are dropped (reference PUT /{id}/rigs).
create or replace function public.insp_document_set_update_rigs(p_id uuid, p_unit_ids uuid[])
returns jsonb language plpgsql security definer set search_path = public as
$$
declare n int;
begin
  if not (public.has_insp_perm('shared-document:create') and public.insp_doc_set_manageable(p_id)) then
    raise exception 'permission denied';
  end if;
  if coalesce(array_length(p_unit_ids, 1), 0) = 0 then raise exception 'At least one rig is required'; end if;
  if exists (select 1 from unnest(p_unit_ids) x where x not in (select public.insp_unit_ids())) then
    raise exception 'One or more rigs are outside your scope';
  end if;
  delete from public.insp_document_set_links l using public.insp_records r
   where l.set_id = p_id and r.id = l.record_id and r.unit_id <> all (p_unit_ids);
  get diagnostics n = row_count;
  delete from public.insp_document_set_units where set_id = p_id and unit_id <> all (p_unit_ids);
  insert into public.insp_document_set_units (set_id, unit_id)
  select distinct p_id, x from unnest(p_unit_ids) x on conflict do nothing;
  return jsonb_build_object('unlinked', n);
end $$;

grant execute on function public.insp_document_sets_list(), public.insp_document_set_detail(uuid),
  public.insp_record_shared_documents(uuid), public.insp_document_set_create(text, text, uuid[]),
  public.insp_document_set_update_rigs(uuid, uuid[]) to authenticated;

-- ---- audit (same generic trigger as 0045) ---------------------------------------------
drop trigger if exists insp_audit on public.insp_document_sets;
create trigger insp_audit after insert or update or delete on public.insp_document_sets
  for each row execute function public.insp_audit_trigger('SharedDocumentSet', 'name', 'id');
drop trigger if exists insp_audit on public.insp_document_set_files;
create trigger insp_audit after insert or update or delete on public.insp_document_set_files
  for each row execute function public.insp_audit_trigger('SharedDocument', 'file_name', 'id');
drop trigger if exists insp_audit on public.insp_document_set_links;
create trigger insp_audit after insert or update or delete on public.insp_document_set_links
  for each row execute function public.insp_audit_trigger('SharedDocumentLink', 'record_id', 'set_id,record_id');
