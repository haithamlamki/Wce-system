-- ============================================================================
--  Project revision history (PRD §8 / FR-59).
--  Immutable per-save snapshots of a project document, so users can view the
--  history and restore an earlier revision. Append-only: authenticated users
--  may read and insert, but not update or delete (history is tamper-evident).
-- ============================================================================

create table if not exists public.project_versions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  revision integer not null default 0,
  rig_name text,
  reference_date date,
  inspector text,
  note text,
  data jsonb not null,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);

create index if not exists project_versions_project_idx
  on public.project_versions (project_id, created_at desc);

alter table public.project_versions enable row level security;

drop policy if exists project_versions_auth_read on public.project_versions;
drop policy if exists project_versions_auth_insert on public.project_versions;
create policy project_versions_auth_read on public.project_versions
  for select to authenticated using (true);
create policy project_versions_auth_insert on public.project_versions
  for insert to authenticated with check (true);
