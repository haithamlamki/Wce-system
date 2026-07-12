-- ============================================================================
--  0026: Optimistic-concurrency + attribution for project saves (Phase 0 of the
--  multi-admin data-integrity fix).
--
--  Root cause addressed: two admins editing the same unit both cached the same
--  "latest projects row" id and each did a blind upsert of the whole JSONB doc —
--  last write silently clobbered the other, with no record of who overwrote whom.
--
--  This adds:
--    * projects.version    — a monotonic lock counter (compare-and-swap on save)
--    * projects.updated_by — who actually last wrote the row (attribution)
--    * save_project_guarded() — a SECURITY DEFINER RPC that, in ONE transaction,
--      checks the caller's expected version, refuses a stale write with a
--      'save_conflict' error instead of overwriting, bumps the version, stamps
--      updated_by, and appends the project_versions snapshot.
--
--  RLS is unchanged: any admin/manager may still edit any rig's project (per the
--  chosen "any admin, but tracked + conflict-safe" model). The guard makes an
--  overwrite impossible to do *silently* — a conflicting save is rejected so the
--  UI can prompt to reload. The direct-table upsert path still works for older
--  clients; new clients route through the RPC.
--  Applied to Supabase project reutvufibeezhknxdudc.
-- ============================================================================

alter table public.projects add column if not exists version integer not null default 1;
alter table public.projects add column if not exists updated_by uuid references auth.users(id);

-- Backfill attribution for pre-existing rows so history isn't blank.
update public.projects set updated_by = created_by where updated_by is null;

-- Keep updated_by truthful on any DIRECT table update (legacy upsert path),
-- not just the RPC. Runs alongside the existing updated_at touch trigger.
create or replace function public.projects_stamp_updated_by()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  return new;
end $$;

drop trigger if exists projects_stamp_updated_by on public.projects;
create trigger projects_stamp_updated_by
  before update on public.projects
  for each row execute function public.projects_stamp_updated_by();

-- ---------------------------------------------------------------------------
--  Guarded save: compare-and-swap on `version`. Raises 'save_conflict' (SQLSTATE
--  40001) when the row moved on since the caller loaded it, so nothing is lost.
--  Pass p_id = null to INSERT a brand-new project (returns its id + version 1).
-- ---------------------------------------------------------------------------
create or replace function public.save_project_guarded(
  p_id uuid,
  p_expected_version integer,
  p_rig text,
  p_reference_date text,
  p_inspector text,
  p_revision integer,
  p_data jsonb,
  p_note text
) returns table (id uuid, version integer, updated_at timestamptz, updated_by uuid)
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_id  uuid;
  v_cur integer;
begin
  -- Mirror the projects RLS write scope (privileged, or same-rig) since
  -- SECURITY DEFINER bypasses RLS.
  if not (public.is_privileged() or p_rig = public.my_rig()) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  if p_id is null then
    insert into public.projects
      (rig_name, reference_date, inspector, revision, data, created_by, updated_by, version)
    values
      (p_rig, nullif(p_reference_date,'')::date, nullif(p_inspector,''),
       coalesce(p_revision,0), p_data, v_uid, v_uid, 1)
    returning public.projects.id into v_id;
  else
    -- Lock the row, then verify the caller isn't writing over a newer version.
    select p.version into v_cur from public.projects p where p.id = p_id for update;
    if not found then
      raise exception 'project_not_found' using errcode = 'P0002';
    end if;
    if p_expected_version is not null and v_cur is not null and v_cur <> p_expected_version then
      raise exception 'save_conflict' using errcode = '40001';
    end if;
    update public.projects p
      set data = p_data,
          rig_name = p_rig,
          reference_date = nullif(p_reference_date,'')::date,
          inspector = nullif(p_inspector,''),
          revision = coalesce(p_revision,0),
          version = coalesce(p.version,1) + 1,
          updated_by = v_uid
      where p.id = p_id
      returning p.id into v_id;
  end if;

  -- Immutable revision snapshot (best-effort parity with the legacy path).
  insert into public.project_versions
    (project_id, revision, rig_name, reference_date, inspector, note, data, created_by)
  values
    (v_id, coalesce(p_revision,0), p_rig, nullif(p_reference_date,'')::date,
     nullif(p_inspector,''), nullif(p_note,''), p_data, v_uid);

  return query
    select p.id, p.version, p.updated_at, p.updated_by
    from public.projects p where p.id = v_id;
end $$;

revoke all on function public.save_project_guarded(uuid,integer,text,text,text,integer,jsonb,text) from anon, public;
grant execute on function public.save_project_guarded(uuid,integer,text,text,text,integer,jsonb,text) to authenticated;
