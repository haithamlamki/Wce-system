-- ============================================================================
--  0039_symbol_models.sql — optional 3D (.glb) model per library symbol.
--  Kept in its own table (NOT a column on public.symbols) because the symbols
--  catalog is fetched in full on every load; models are fetched one at a time.
--  Same access model as 0009_symbols: any authenticated user reads, only
--  privileged (admin / manager) users write.
--  Not applied automatically — review, then run via `supabase db push`.
-- ============================================================================

create table if not exists public.symbol_models (
  key        text primary key,
  glb_b64    text not null,
  bytes      integer not null default 0,
  updated_by uuid references auth.users(id) default auth.uid(),
  updated_at timestamptz not null default now(),
  constraint symbol_models_size check (bytes between 1 and 10485760)
);

drop trigger if exists symbol_models_touch on public.symbol_models;
create trigger symbol_models_touch before update on public.symbol_models
  for each row execute function public.touch_updated_at();

alter table public.symbol_models enable row level security;

drop policy if exists symbol_models_read on public.symbol_models;
create policy symbol_models_read on public.symbol_models
  for select to authenticated using (true);

drop policy if exists symbol_models_insert on public.symbol_models;
create policy symbol_models_insert on public.symbol_models
  for insert to authenticated with check (public.is_privileged());

drop policy if exists symbol_models_update on public.symbol_models;
create policy symbol_models_update on public.symbol_models
  for update to authenticated using (public.is_privileged()) with check (public.is_privileged());

drop policy if exists symbol_models_delete on public.symbol_models;
create policy symbol_models_delete on public.symbol_models
  for delete to authenticated using (public.is_privileged());
