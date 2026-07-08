-- ============================================================================
--  0011_project_versions_rls.sql — fix project_versions RLS (F3).
--  0005_project_versions.sql shipped project_versions with
--  `select using(true)` / `insert with check(true)`, which let ANY
--  authenticated user read every rig's full project JSONB history and forge
--  version rows for any rig / on behalf of any user. This tightens both
--  policies to match the per-rig authorization model introduced in
--  0003_per_rig_authorization.sql (public.my_rig() / public.is_privileged()):
--    - read:   privileged (admin/manager) or the caller's own rig only.
--    - insert: privileged or the caller's own rig, AND created_by must be the
--              caller (auth.uid()) — no forging history on someone else's
--              behalf.
--  Append-only is preserved: no update/delete policy is added here, so
--  version history stays tamper-evident (matches 0005's intent).
--  Idempotent / forward-only: safe to re-run, no data change, no downtime.
-- ============================================================================

drop policy if exists project_versions_auth_read on public.project_versions;
drop policy if exists project_versions_auth_insert on public.project_versions;
drop policy if exists project_versions_read on public.project_versions;
drop policy if exists project_versions_insert on public.project_versions;

create policy project_versions_read on public.project_versions
  for select to authenticated
  using (public.is_privileged() or rig_name = public.my_rig());

create policy project_versions_insert on public.project_versions
  for insert to authenticated
  with check ((public.is_privileged() or rig_name = public.my_rig()) and created_by = auth.uid());
