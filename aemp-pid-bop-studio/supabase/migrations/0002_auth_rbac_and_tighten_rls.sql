-- ============================================================================
--  Close the security gap (PRD §7.2): auth profiles + roles, and replace the
--  demo anon-CRUD policies with authenticated, role-aware RLS.
--  Applied to Supabase project reutvufibeezhknxdudc (Wce-system).
-- ============================================================================

do $$ begin
  create type public.user_role as enum ('admin','field','manager');
exception when duplicate_object then null; end $$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  role public.user_role not null default 'field',
  rig text,
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;

drop policy if exists profiles_self_read on public.profiles;
drop policy if exists profiles_self_upsert on public.profiles;
create policy profiles_self_read on public.profiles
  for select to authenticated using (id = auth.uid());
create policy profiles_self_upsert on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name',''))
  on conflict (id) do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users for each row execute function public.handle_new_user();

alter table public.projects add column if not exists created_by uuid references auth.users(id) default auth.uid();
drop policy if exists demo_anon_projects on public.projects;
create policy projects_auth_read on public.projects for select to authenticated using (true);
create policy projects_auth_insert on public.projects for insert to authenticated with check (created_by = auth.uid() or created_by is null);
create policy projects_auth_update on public.projects for update to authenticated using (true) with check (true);
create policy projects_owner_delete on public.projects for delete to authenticated using (created_by = auth.uid());

drop policy if exists demo_anon_equipment on public.equipment;
create policy equipment_auth_read on public.equipment for select to authenticated using (true);
create policy equipment_admin_write on public.equipment for all to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

-- After a user registers, promote them with:
--   update public.profiles set role = 'admin' where email = 'you@example.com';
