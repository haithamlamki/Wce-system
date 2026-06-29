-- ============================================================================
--  AEMP P&ID & BOP Studio — initial schema (PRD §8, FR-36/37/59)
--  Applied to Supabase project reutvufibeezhknxdudc (Wce-system) on init.
-- ============================================================================

-- Saved P&ID projects: queryable meta columns + full document as JSONB.
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  rig_name text not null default 'Rig',
  reference_date date,
  inspector text,
  revision integer not null default 0,
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index projects_rig_name_idx on public.projects (rig_name);

-- AEMP-equivalent WCE equipment register (read model for import; FR-36/37).
create table public.equipment (
  id uuid primary key default gen_random_uuid(),
  rig_name text not null default 'Rig 303',
  tag text,
  type text,
  section text,
  description text,
  rwp text,
  size text,
  manufacturer text,
  serial text,
  int_last date,
  int_due date,
  maj_last date,
  maj_due date,
  created_at timestamptz not null default now()
);
create index equipment_rig_name_idx on public.equipment (rig_name);
create index equipment_tag_idx on public.equipment (tag);

-- keep projects.updated_at fresh
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
create trigger projects_touch before update on public.projects
  for each row execute function public.touch_updated_at();

-- Row Level Security.
-- DEMO POLICY: the frontend currently uses only the publishable (anon) key with
-- no auth, so we allow anon CRUD to make the Phase-1 demo work. PRODUCTION must
-- replace these with AEMP SSO (authenticated role) + per-rig authorisation
-- (PRD §7.2 / §10.1 / §16.4). Do not ship anon-write to production.
alter table public.projects enable row level security;
alter table public.equipment enable row level security;
create policy "demo_anon_projects" on public.projects for all to anon using (true) with check (true);
create policy "demo_anon_equipment" on public.equipment for all to anon using (true) with check (true);
