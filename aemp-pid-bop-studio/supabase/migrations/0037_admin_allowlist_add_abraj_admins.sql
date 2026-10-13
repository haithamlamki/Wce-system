-- ============================================================================
--  0037: Add four Abraj staff accounts to the admin allowlist. handle_new_user
--  (see 0015) gives them role 'admin' when their auth user is created. The
--  accounts were provisioned directly with a temporary password and
--  user_metadata.must_change_password = true, so the app forces a new password
--  on first sign-in. The password is not stored in this repo. Applied live to
--  project reutvufibeezhknxdudc.
-- ============================================================================

insert into public.admin_allowlist (email) values
  ('exfi08@abrajenergy.com'),
  ('field.superintendent5@abrajenergy.com'),
  ('extrdr10@abrajenergy.com'),
  ('extrdr09@abrajenergy.com')
on conflict (email) do nothing;

update public.profiles p
set role = 'admin'
where lower(p.email) in ('exfi08@abrajenergy.com', 'field.superintendent5@abrajenergy.com',
                         'extrdr10@abrajenergy.com', 'extrdr09@abrajenergy.com')
  and p.role <> 'admin';
