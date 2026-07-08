-- ============================================================================
--  0009_symbols.sql — global (company-wide) Symbol library.
--  One row per custom symbol ('custom_*' key), per built-in override (built-in
--  key, custom=false), or per hidden built-in (hidden=true). Everyone
--  authenticated can read the catalog; only admins/managers (is_privileged)
--  may add / edit / delete / hide symbols. Mirrors 0008_units.sql.
-- ============================================================================

create table if not exists public.symbols (
  key        text primary key,
  name       text not null default '',
  cat        text not null default 'Custom',
  w          integer not null default 100,
  h          integer not null default 70,
  color      text not null default '#3a4654',
  svg        text not null default '',
  shapes     jsonb,
  custom     boolean not null default true,
  hidden     boolean not null default false,
  updated_by uuid references auth.users(id) default auth.uid(),
  updated_at timestamptz not null default now()
);

-- keep updated_at fresh on every write (touch_updated_at() is defined in 0001)
drop trigger if exists symbols_touch on public.symbols;
create trigger symbols_touch before update on public.symbols
  for each row execute function public.touch_updated_at();

alter table public.symbols enable row level security;

-- read: any authenticated user (field crews browse + place symbols)
drop policy if exists symbols_read on public.symbols;
create policy symbols_read on public.symbols
  for select to authenticated using (true);

-- write: privileged only (admin / manager)
drop policy if exists symbols_insert on public.symbols;
create policy symbols_insert on public.symbols
  for insert to authenticated with check (public.is_privileged());

drop policy if exists symbols_update on public.symbols;
create policy symbols_update on public.symbols
  for update to authenticated using (public.is_privileged()) with check (public.is_privileged());

drop policy if exists symbols_delete on public.symbols;
create policy symbols_delete on public.symbols
  for delete to authenticated using (public.is_privileged());
