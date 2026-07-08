-- ============================================================================
--  0012_cloud_rpcs.sql — transactional cloud RPCs (F12, PR6).
--  Root cause: the client previously performed two destructive multi-statement
--  operations with NO rollback on partial failure:
--    - replaceRigEquipment: delete-all-then-chunk-insert the equipment register
--      (a failed chunk left the register wiped or half-written).
--    - renameUnit: re-keyed units/projects/equipment/manuals in separate
--      best-effort statements (a failed statement left rig_name inconsistent
--      across tables).
--  Both are moved into SECURITY DEFINER Postgres functions: a function body is
--  one implicit transaction, so any error rolls back everything the function
--  did. Each function re-checks authorization internally (the in-function
--  guard is the real gate; the grant below only lets authenticated users call
--  in) so the SAME authorization the RLS previously enforced is preserved —
--  NOT loosened:
--    - equipment writes stay admin-only (my_role() = 'admin'), matching
--      0003_per_rig_authorization.sql's equipment_admin_write policy.
--    - unit rename stays privileged-only (is_privileged()), matching
--      0008_units.sql's units_update policy.
-- ============================================================================

create or replace function public.replace_rig_equipment(p_rig text, p_rows jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  if public.my_role() <> 'admin' then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  delete from public.equipment where rig_name = p_rig;

  insert into public.equipment (
    rig_name, tag, type, section, description, rwp, size, manufacturer, serial,
    int_last, int_due, maj_last, maj_due
  )
  select p_rig, x.tag, x.type, x.section, x.description, x.rwp, x.size, x.manufacturer, x.serial,
         x.int_last, x.int_due, x.maj_last, x.maj_due
  from jsonb_to_recordset(p_rows) as x(
    tag text, type text, section text, description text, rwp text, size text,
    manufacturer text, serial text, int_last date, int_due date, maj_last date, maj_due date
  );

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

grant execute on function public.replace_rig_equipment(text, jsonb) to authenticated;

create or replace function public.rename_unit(p_old text, p_new text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_privileged() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  update public.units set name = p_new where name = p_old;
  update public.projects set rig_name = p_new where rig_name = p_old;
  update public.equipment set rig_name = p_new where rig_name = p_old;
  -- manuals postdates 0001 (added in 0007) — guard so this function also
  -- works against a DB that somehow predates it.
  if to_regclass('public.manuals') is not null then
    update public.manuals set rig_name = p_new where rig_name = p_old;
  end if;
end;
$$;

grant execute on function public.rename_unit(text, text) to authenticated;
