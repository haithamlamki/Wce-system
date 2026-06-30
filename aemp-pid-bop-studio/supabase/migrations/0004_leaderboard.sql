-- ============================================================================
--  Crew leaderboard (PRD §7.13, FR-54).
--  Adds a points column to profiles (each user writes their own via the
--  existing profiles_self_upsert policy) and a SECURITY DEFINER function that
--  returns only the leaderboard-safe fields (name / points / rig) so ranking
--  does NOT require opening profiles' email/role to all authenticated users.
-- ============================================================================

alter table public.profiles add column if not exists points integer not null default 0;

create or replace function public.leaderboard()
returns table (id uuid, full_name text, points integer, rig text)
language sql
security definer
set search_path = public
as $$
  select id, coalesce(full_name, '—') as full_name, coalesce(points, 0) as points, rig
  from public.profiles
  order by points desc nulls last
  limit 100;
$$;

grant execute on function public.leaderboard() to authenticated;
