-- ============================================================================
--  0025: Add fatmaalmashari0@gmail.com to the admin allowlist. Auto-promoted
--  to 'admin' on registration via handle_new_user (see 0015). Also promotes
--  the profile immediately if it already exists. Applied live to project
--  reutvufibeezhknxdudc.
-- ============================================================================

insert into public.admin_allowlist (email) values
  ('fatmaalmashari0@gmail.com')
on conflict (email) do nothing;

update public.profiles p
set role = 'admin'
where lower(p.email) = lower('fatmaalmashari0@gmail.com')
  and p.role <> 'admin';
