-- ============================================================================
--  0050 — eInspection users (phase 7)
--  profiles.username holds the reference "User Name" (employee number).
--  insp_import_users() mirrors the reference user list: an email that already
--  has an account is linked (password, app role and super admin untouched);
--  any other email gets a new account with the shared temporary password and
--  must change it at first sign-in. Role and scope-template links are added,
--  never removed. Super admin only.
-- ============================================================================

alter table public.profiles add column if not exists username text;

create or replace function public.insp_import_users(p_users jsonb, p_password text)
  returns jsonb
  language plpgsql security definer set search_path = public as $$
declare
  u jsonb;
  v_email text;
  v_id uuid;
  v_first text;
  v_last text;
  v_created int := 0;
  v_linked int := 0;
  v_roles int := 0;
  v_tpls int := 0;
  v_n int;
  v_missing text[] := '{}';
begin
  if not public.is_super_admin() then
    raise exception 'permission denied: super admin required';
  end if;
  if length(coalesce(p_password, '')) < 8 then
    raise exception 'password must be at least 8 characters';
  end if;

  for u in select * from jsonb_array_elements(p_users) loop
    v_email := lower(trim(u->>'email'));
    if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
      raise exception 'invalid email address: %', v_email;
    end if;
    v_first := trim(coalesce(u->>'firstName', ''));
    v_last  := trim(coalesce(u->>'lastName', ''));

    select id into v_id from auth.users where lower(email) = v_email;

    if v_id is null then
      v_id := (u->>'id')::uuid;
      if exists (select 1 from auth.users where id = v_id) then
        v_id := gen_random_uuid();
      end if;

      insert into auth.users (
        instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
        raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
        confirmation_token, recovery_token, email_change_token_new, email_change)
      values (
        '00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated',
        v_email, extensions.crypt(p_password, extensions.gen_salt('bf')), now(),
        '{"provider":"email","providers":["email"]}'::jsonb,
        jsonb_build_object('full_name', trim(v_first || ' ' || v_last), 'must_change_password', true),
        now(), now(), '', '', '', '');

      insert into auth.identities (id, user_id, provider_id, identity_data, provider, created_at, updated_at)
      values (gen_random_uuid(), v_id, v_id::text,
              jsonb_build_object('sub', v_id::text, 'email', v_email, 'email_verified', true),
              'email', now(), now());

      -- handle_new_user has created the profile (role from admin_allowlist).
      update public.profiles
         set first_name = v_first, last_name = v_last,
             full_name = trim(v_first || ' ' || v_last),
             username = nullif(trim(u->>'userName'), ''),
             active = coalesce((u->>'isActive')::boolean, true),
             access_expiry = nullif(u->>'accessExpiryDate', '')::date
       where id = v_id;
      v_created := v_created + 1;
    else
      update public.profiles
         set username = coalesce(nullif(trim(u->>'userName'), ''), username),
             first_name = coalesce(nullif(first_name, ''), v_first),
             last_name = coalesce(nullif(last_name, ''), v_last),
             full_name = coalesce(nullif(full_name, ''), trim(v_first || ' ' || v_last))
       where id = v_id;
      v_linked := v_linked + 1;
    end if;

    insert into public.insp_user_roles (user_id, role_id, granted_by)
    select v_id, r.id, auth.uid()
      from jsonb_array_elements_text(coalesce(u->'roleIds', '[]')) x
      join public.insp_roles r on r.id = x::uuid
    on conflict do nothing;
    get diagnostics v_n = row_count; v_roles := v_roles + v_n;

    insert into public.insp_user_scope_templates (user_id, template_id, granted_by)
    select v_id, t.id, auth.uid()
      from jsonb_array_elements_text(coalesce(u->'scopeTemplateIds', '[]')) x
      join public.insp_scope_templates t on t.id = x::uuid
    on conflict do nothing;
    get diagnostics v_n = row_count; v_tpls := v_tpls + v_n;

    v_missing := v_missing || array(
      select 'role ' || x from jsonb_array_elements_text(coalesce(u->'roleIds', '[]')) x
       where not exists (select 1 from public.insp_roles r where r.id = x::uuid)
      union all
      select 'template ' || x from jsonb_array_elements_text(coalesce(u->'scopeTemplateIds', '[]')) x
       where not exists (select 1 from public.insp_scope_templates t where t.id = x::uuid));
  end loop;

  return jsonb_build_object('created', v_created, 'linked', v_linked,
    'roleLinks', v_roles, 'templateLinks', v_tpls, 'missing', to_jsonb(v_missing));
end $$;

revoke all on function public.insp_import_users(jsonb, text) from public, anon;
grant execute on function public.insp_import_users(jsonb, text) to authenticated;
