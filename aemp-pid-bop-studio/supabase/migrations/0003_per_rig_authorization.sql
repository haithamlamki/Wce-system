-- ============================================================================
--  Per-rig authorization (PRD §7.2 / §10.1). Field users are scoped to their
--  assigned profiles.rig; admins & managers see all rigs. SECURITY DEFINER
--  helpers read the caller's profile without triggering profiles' own RLS.
-- ============================================================================

create or replace function public.my_role() returns public.user_role
  language sql security definer stable set search_path = public as
$$ select role from public.profiles where id = auth.uid() $$;

create or replace function public.my_rig() returns text
  language sql security definer stable set search_path = public as
$$ select rig from public.profiles where id = auth.uid() $$;

create or replace function public.is_privileged() returns boolean
  language sql security definer stable set search_path = public as
$$ select coalesce((select role in ('admin','manager') from public.profiles where id = auth.uid()), false) $$;

-- ---- projects: scope read/write to the user's rig (admins/managers: all) ----
drop policy if exists projects_auth_read on public.projects;
drop policy if exists projects_auth_insert on public.projects;
drop policy if exists projects_auth_update on public.projects;
drop policy if exists projects_owner_delete on public.projects;

create policy projects_read on public.projects
  for select to authenticated
  using (public.is_privileged() or rig_name = public.my_rig());
create policy projects_insert on public.projects
  for insert to authenticated
  with check ((created_by = auth.uid() or created_by is null)
              and (public.is_privileged() or rig_name = public.my_rig()));
create policy projects_update on public.projects
  for update to authenticated
  using (public.is_privileged() or rig_name = public.my_rig())
  with check (public.is_privileged() or rig_name = public.my_rig());
create policy projects_delete on public.projects
  for delete to authenticated
  using (created_by = auth.uid() and (public.is_privileged() or rig_name = public.my_rig()));

-- ---- equipment: read scoped to rig; writes admin-only -----------------------
drop policy if exists equipment_auth_read on public.equipment;
drop policy if exists equipment_admin_write on public.equipment;

create policy equipment_read on public.equipment
  for select to authenticated
  using (public.is_privileged() or rig_name = public.my_rig());
create policy equipment_admin_write on public.equipment
  for all to authenticated
  using (public.my_role() = 'admin')
  with check (public.my_role() = 'admin');
