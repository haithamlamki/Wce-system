-- ============================================================================
--  0033_inspection_access_matrix.sql — reference-parity Security Management:
--  user identity fields (first/last name, phone, job roles) and the per-unit ×
--  equipment-system Configure Access matrix (guide §5.14 / User Edit page).
--  A NULL insp_categories means Full Access to that unit (every system).
-- ============================================================================

-- ---- 1) profile identity fields (reference user form) --------------------------
alter table public.profiles add column if not exists first_name text not null default '';
alter table public.profiles add column if not exists last_name  text not null default '';
alter table public.profiles add column if not exists phone      text not null default '';
alter table public.profiles add column if not exists job_roles  text[] not null default '{}';

-- ---- 2) unit access gains system-category scoping ------------------------------
alter table public.user_unit_assignments
  add column if not exists insp_categories public.insp_category[] default null;

-- ---- 3) audited setter accepting the full matrix (0014 pattern) ----------------
-- p_access: [{"unit_id": "<uuid>", "categories": null | ["well_control", ...]}, ...]
-- Replaces the user's whole assignment set atomically. set_user_units() from 0014
-- stays for callers that don't scope categories (it leaves insp_categories NULL).
create or replace function public.set_user_unit_access(p_user uuid, p_access jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare r jsonb;
begin
  if not public.is_privileged() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  delete from public.user_unit_assignments where user_id = p_user;
  for r in select * from jsonb_array_elements(coalesce(p_access, '[]'::jsonb)) loop
    insert into public.user_unit_assignments (user_id, unit_id, assigned_by, insp_categories)
    values (p_user, (r->>'unit_id')::uuid, auth.uid(),
            case when r->'categories' is null or jsonb_typeof(r->'categories') = 'null'
                 then null
                 else (select array_agg(x::public.insp_category)
                       from jsonb_array_elements_text(r->'categories') as x) end);
  end loop;

  insert into public.admin_audit_log (actor, action, entity, entity_id, detail)
  values (auth.uid(), 'set_user_unit_access', 'user_unit_assignments', p_user::text,
          jsonb_build_object('access', coalesce(p_access, '[]'::jsonb)));
end;
$$;

revoke all on function public.set_user_unit_access(uuid, jsonb) from public;
revoke execute on function public.set_user_unit_access(uuid, jsonb) from anon;
grant execute on function public.set_user_unit_access(uuid, jsonb) to authenticated;
