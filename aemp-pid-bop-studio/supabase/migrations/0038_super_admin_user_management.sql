-- ============================================================================
--  0038: Super Admin + User Management. A super admin is an ordinary admin
--  (profiles.role = 'admin', so every existing admin path keeps working) that
--  additionally holds profiles.is_super_admin. Only a super admin may call the
--  user-management RPCs below: create accounts with a chosen role and reset any
--  user's password. Passwords are hashed with pgcrypto bcrypt exactly as GoTrue
--  stores them. Applied live to project reutvufibeezhknxdudc.
-- ============================================================================

alter table public.profiles add column if not exists is_super_admin boolean not null default false;

create or replace function public.is_super_admin() returns boolean
  language sql stable security definer set search_path = public as
$$ select coalesce((select p.is_super_admin and p.active from public.profiles p where p.id = auth.uid()), false) $$;

-- Extends the 0032 guard. Trusted contexts (SQL console / service role, where
-- auth.uid() is null) pass through; RLS already keeps anon from updating rows.
create or replace function public.profiles_guard() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    return new;
  end if;
  if not public.is_privileged() then
    if new.role is distinct from old.role
       or new.active is distinct from old.active
       or new.access_expiry is distinct from old.access_expiry then
      raise exception 'not authorized to change role or account validity';
    end if;
  end if;
  if new.is_super_admin is distinct from old.is_super_admin and not public.is_super_admin() then
    raise exception 'only a super admin can grant or revoke super admin';
  end if;
  -- Other admins cannot demote, deactivate or expire a super admin.
  if old.is_super_admin and not public.is_super_admin()
     and (new.role is distinct from old.role
          or new.active is distinct from old.active
          or new.access_expiry is distinct from old.access_expiry) then
    raise exception 'only a super admin can change a super admin account';
  end if;
  -- A super admin cannot lock themselves out.
  if old.id = auth.uid() and old.is_super_admin
     and (not new.is_super_admin or not new.active or new.role <> 'admin'
          or new.access_expiry is not null) then
    raise exception 'you cannot remove your own super admin access';
  end if;
  return new;
end $$;

-- ---- RPCs (super admin only) ---------------------------------------------------

create or replace function public.admin_list_users()
  returns table (id uuid, email text, full_name text, role public.user_role, rig text,
                 active boolean, access_expiry date, is_super_admin boolean,
                 must_change_password boolean, created_at timestamptz, last_sign_in_at timestamptz)
  language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_super_admin() then
    raise exception 'permission denied: super admin required';
  end if;
  return query
    select p.id, coalesce(p.email, u.email)::text, p.full_name, p.role, p.rig, p.active, p.access_expiry,
           p.is_super_admin,
           coalesce((u.raw_user_meta_data->>'must_change_password')::boolean, false),
           u.created_at, u.last_sign_in_at
    from public.profiles p
    join auth.users u on u.id = p.id
    order by lower(coalesce(nullif(p.full_name, ''), p.email));
end $$;

create or replace function public.admin_create_user(
  p_email text, p_password text, p_full_name text,
  p_role public.user_role default 'field', p_must_change boolean default true)
  returns uuid
  language plpgsql security definer set search_path = public as $$
declare
  v_email text := lower(trim(p_email));
  v_id uuid := gen_random_uuid();
begin
  if not public.is_super_admin() then
    raise exception 'permission denied: super admin required';
  end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'invalid email address';
  end if;
  if length(coalesce(p_password, '')) < 8 then
    raise exception 'password must be at least 8 characters';
  end if;
  if exists (select 1 from auth.users where lower(email) = v_email) then
    raise exception 'an account with this email already exists';
  end if;

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change)
  values (
    '00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated',
    v_email, extensions.crypt(p_password, extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('full_name', coalesce(trim(p_full_name), ''), 'must_change_password', p_must_change),
    now(), now(), '', '', '', '');

  insert into auth.identities (id, user_id, provider_id, identity_data, provider, created_at, updated_at)
  values (gen_random_uuid(), v_id, v_id::text,
          jsonb_build_object('sub', v_id::text, 'email', v_email, 'email_verified', true),
          'email', now(), now());

  -- handle_new_user (0015) has created the profile; apply the chosen role.
  update public.profiles
     set role = p_role, full_name = coalesce(trim(p_full_name), '')
   where id = v_id;

  return v_id;
end $$;

create or replace function public.admin_reset_password(
  p_user uuid, p_password text, p_must_change boolean default true)
  returns void
  language plpgsql security definer set search_path = public as $$
begin
  if not public.is_super_admin() then
    raise exception 'permission denied: super admin required';
  end if;
  if length(coalesce(p_password, '')) < 8 then
    raise exception 'password must be at least 8 characters';
  end if;

  update auth.users
     set encrypted_password = extensions.crypt(p_password, extensions.gen_salt('bf')),
         raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb)
                              || jsonb_build_object('must_change_password', p_must_change),
         updated_at = now()
   where id = p_user;
  if not found then
    raise exception 'user not found';
  end if;

  -- Sign the user out everywhere (refresh tokens cascade with the session),
  -- except when a super admin resets their own password from this page.
  if p_user <> auth.uid() then
    delete from auth.sessions where user_id = p_user;
  end if;
end $$;

-- ---- grants -------------------------------------------------------------------
do $$ declare f text;
begin
  foreach f in array array[
    'is_super_admin()',
    'admin_list_users()',
    'admin_create_user(text, text, text, public.user_role, boolean)',
    'admin_reset_password(uuid, text, boolean)'
  ] loop
    execute format('revoke all on function public.%s from public', f);
    execute format('revoke execute on function public.%s from anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

-- ---- the super admin ----------------------------------------------------------
update public.profiles
   set is_super_admin = true, role = 'admin', active = true, access_expiry = null
 where lower(email) = 'haithamlamki@gmail.com';
