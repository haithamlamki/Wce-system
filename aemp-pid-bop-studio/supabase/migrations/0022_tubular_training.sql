-- ============================================================================
--  0022_tubular_training.sql — Tubular module: training content + progress.
--  Progress is stored against the authenticated user (never browser-local).
--  Modules are seeded reference content; admins manage them via is_privileged.
-- ============================================================================

create table if not exists public.training_modules (
  id       uuid primary key default gen_random_uuid(),
  slug     text not null unique,
  title    text not null,
  summary  text not null default '',
  position int  not null,
  active   boolean not null default true
);

create table if not exists public.training_progress (
  user_id      uuid not null references auth.users(id) on delete cascade,
  module_id    uuid not null references public.training_modules(id) on delete cascade,
  completed_at timestamptz not null default clock_timestamp(),
  score        int check (score between 0 and 100),
  primary key (user_id, module_id)
);

alter table public.training_modules enable row level security;
alter table public.training_progress enable row level security;

drop policy if exists training_modules_read on public.training_modules;
create policy training_modules_read on public.training_modules
  for select to authenticated using (true);

drop policy if exists training_modules_write on public.training_modules;
create policy training_modules_write on public.training_modules
  for all to authenticated
  using (public.is_privileged()) with check (public.is_privileged());

-- users own their progress; supervisors (privileged) can report on it
drop policy if exists training_progress_read on public.training_progress;
create policy training_progress_read on public.training_progress
  for select to authenticated
  using (user_id = auth.uid() or public.is_privileged());

drop policy if exists training_progress_upsert on public.training_progress;
create policy training_progress_upsert on public.training_progress
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists training_progress_update on public.training_progress;
create policy training_progress_update on public.training_progress
  for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

insert into public.training_modules (slug, title, summary, position) values
  ('api-rp-7g-classes', 'API RP 7G classification', 'Premium / Class 2 / Class 3 / Scrap bands, wall thickness and OD wear limits.', 1),
  ('colour-bands', 'Colour band marking', 'Reading the paint bands and centre punch marks on inspected pipe.', 2),
  ('data-entry-sheet', 'Monthly tubular sheet', 'Filling the Rig/Hoist grid: categories, counts, remarks, rental dates.', 3),
  ('serviceability', 'Serviceable vs on-board stock', 'Why only Premium + Class 2 count toward the contract; how shortfall is computed.', 4),
  ('inspection-zones', 'Inspection zones A/B/C', 'Pipe body, tool joint and transition zone coverage under API RP 7G.', 5),
  ('transfers', 'Rig-to-rig transfers', 'Initiating, receiving and cancelling transfers; why quantities move only on receipt.', 6),
  ('pipe-orders', 'Pipe orders & delivery', 'Requesting pipe, approval holds, dispatch and delivery confirmation.', 7),
  ('scrap-handling', 'Scrap & repair dispatch', 'Segregating red-band pipe and recording Send to Repair.', 8)
on conflict (slug) do nothing;
