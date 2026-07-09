-- ============================================================================
--  0015: Admin allowlist. Emails in this table are auto-promoted to 'admin'
--  when they register (handle_new_user). Also promotes any already-existing
--  profiles matching the allowlist. RLS enabled with no policies: only
--  service_role / SQL console can read or modify the list.
--  Applied to Supabase project reutvufibeezhknxdudc as
--  'admin_allowlist_auto_promote'.
-- ============================================================================

create table if not exists public.admin_allowlist (
  email text primary key,
  created_at timestamptz not null default now()
);
alter table public.admin_allowlist enable row level security;
revoke all on public.admin_allowlist from anon, authenticated;

insert into public.admin_allowlist (email) values
  ('muaa18th@icloud.com'),
  ('layanalbalushi02@gmail.com')
on conflict (email) do nothing;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name',''),
    case when exists (
      select 1 from public.admin_allowlist a
      where lower(a.email) = lower(new.email)
    ) then 'admin'::public.user_role else 'field'::public.user_role end
  )
  on conflict (id) do nothing;
  return new;
end $$;

-- Promote any matching profiles that already exist
update public.profiles p
set role = 'admin'
where exists (
  select 1 from public.admin_allowlist a where lower(a.email) = lower(p.email)
) and p.role <> 'admin';
