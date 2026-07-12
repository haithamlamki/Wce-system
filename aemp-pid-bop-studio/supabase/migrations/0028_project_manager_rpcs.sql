-- ============================================================================
--  0028: Phase 2 — helper RPCs for the unit-centric Project Manager UI.
--
--  All SECURITY DEFINER + is_privileged() gated (the Project Manager is an
--  admin/manager tool). Additive only; nothing existing changes.
--    * list_unit_tree()  — the whole tree in one call: every unit with its
--      diagrams + templates, each carrying version, last-modified time and the
--      editor's display name (joined from profiles, which callers can't read
--      directly under RLS — hence SECURITY DEFINER).
--    * rename_diagram / delete_diagram / rename_template / delete_template —
--      let ANY admin manage items (direct-table DELETE is owner-only by RLS),
--      consistent with the chosen "any admin, but tracked" model.
--  Applied to Supabase project reutvufibeezhknxdudc.
-- ============================================================================

-- Full tree for the Project Manager. Returns [] for non-privileged callers.
create or replace function public.list_unit_tree()
returns jsonb language plpgsql security definer set search_path = public stable as $$
begin
  if not public.is_privileged() then
    return '[]'::jsonb;
  end if;
  return coalesce((
    select jsonb_agg(unit order by unit->>'name')
    from (
      select jsonb_build_object(
        'id', u.id,
        'name', u.name,
        'diagrams', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', p.id, 'name', p.name, 'version', p.version,
            'updated_at', p.updated_at,
            'updated_by', coalesce(pr.full_name, ''),
            'status', p.data->>'status'
          ) order by p.updated_at desc)
          from public.projects p
          left join public.profiles pr on pr.id = p.updated_by
          where p.unit_id = u.id
        ), '[]'::jsonb),
        'templates', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', t.id, 'name', t.name, 'version', t.version,
            'updated_at', t.updated_at,
            'updated_by', coalesce(pr.full_name, '')
          ) order by t.updated_at desc)
          from public.templates t
          left join public.profiles pr on pr.id = t.updated_by
          where t.unit_id = u.id
        ), '[]'::jsonb)
      ) as unit
      from public.units u
    ) s
  ), '[]'::jsonb);
end $$;

create or replace function public.rename_diagram(p_id uuid, p_name text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_privileged() then raise exception 'not_authorized' using errcode = '42501'; end if;
  update public.projects set name = coalesce(nullif(p_name, ''), name) where id = p_id;
end $$;

create or replace function public.delete_diagram(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_privileged() then raise exception 'not_authorized' using errcode = '42501'; end if;
  delete from public.projects where id = p_id; -- project_versions cascade (0005)
end $$;

create or replace function public.rename_template(p_id uuid, p_name text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_privileged() then raise exception 'not_authorized' using errcode = '42501'; end if;
  update public.templates set name = coalesce(nullif(p_name, ''), name) where id = p_id;
end $$;

create or replace function public.delete_template(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_privileged() then raise exception 'not_authorized' using errcode = '42501'; end if;
  delete from public.templates where id = p_id;
end $$;

revoke all on function public.list_unit_tree() from anon, public;
revoke all on function public.rename_diagram(uuid,text) from anon, public;
revoke all on function public.delete_diagram(uuid) from anon, public;
revoke all on function public.rename_template(uuid,text) from anon, public;
revoke all on function public.delete_template(uuid) from anon, public;
grant execute on function public.list_unit_tree() to authenticated;
grant execute on function public.rename_diagram(uuid,text) to authenticated;
grant execute on function public.delete_diagram(uuid) to authenticated;
grant execute on function public.rename_template(uuid,text) to authenticated;
grant execute on function public.delete_template(uuid) to authenticated;
