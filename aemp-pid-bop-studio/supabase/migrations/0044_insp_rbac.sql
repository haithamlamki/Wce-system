-- ============================================================================
--  0044 — Inspection access control switched to the reference eInspection
--  model: Roles hold resource:action Permissions, Scope Templates hold
--  Companies / Units, and users are given roles + scope templates.
--
--    1. insp_permissions (80 keys) · insp_roles · insp_role_permissions
--    2. insp_scope_templates · insp_scope_template_items
--    3. insp_user_roles · insp_user_scope_templates
--    4. has_insp_perm(key) now reads the user's roles; insp_unit_ids() reads
--       the user's scope templates; insp_my_access() feeds the UI
--    5. every inspection RLS policy + RPC rewritten to the new keys
--  admin / manager profiles (is_privileged) still bypass, like SuperAdmin.
--  Legacy insp_* rows in user_module_permissions are no longer consulted.
-- ============================================================================

-- ---- 1) permissions + roles -------------------------------------------------------
create table if not exists public.insp_permissions (
  key      text primary key check (key ~ '^[a-z-]+:[a-z-]+$'),
  resource text not null,
  action   text not null
);
insert into public.insp_permissions (key, resource, action)
select r || ':' || a, r, a from (values
  ('ai','use'), ('audit','view'),
  ('calibration','create'),('calibration','delete'),('calibration','export'),('calibration','file-download'),
  ('calibration','file-upload'),('calibration','import'),('calibration','notify'),('calibration','update'),('calibration','view'),
  ('company','create'),('company','delete'),('company','update'),('company','view'),
  ('dashboard','view'),
  ('equipment','create'),('equipment','delete'),('equipment','update'),('equipment','view'),
  ('equipment-category','create'),('equipment-category','delete'),('equipment-category','update'),('equipment-category','view'),
  ('equipment-component','create'),('equipment-component','delete'),('equipment-component','update'),('equipment-component','view'),
  ('inspection','approve'),('inspection','create'),('inspection','delete'),('inspection','edit-identity'),('inspection','export'),
  ('inspection','import'),('inspection','notify'),('inspection','update'),('inspection','view'),
  ('inspection-file','delete'),('inspection-file','download'),('inspection-file','upload'),
  ('inspection-frequency','create'),('inspection-frequency','delete'),('inspection-frequency','update'),('inspection-frequency','view'),
  ('library','create'),('library','delete'),('library','download'),('library','view'),
  ('log','view'),
  ('pid','create'),('pid','delete'),('pid','issue'),('pid','update'),('pid','view'),
  ('release-log','view'),
  ('role','create'),('role','delete'),('role','manage-permissions'),('role','update'),('role','view'),
  ('shared-document','create'),('shared-document','delete'),('shared-document','view'),
  ('specification','create'),('specification','delete'),('specification','update'),('specification','view'),
  ('unit','create'),('unit','delete'),('unit','update'),('unit','view'),
  ('user','create'),('user','delete'),('user','manage-access'),('user','set-password'),('user','update'),('user','view'),
  ('vendor-company','create'),('vendor-company','update'),('vendor-company','view')
) v(r, a)
on conflict (key) do nothing;

create table if not exists public.insp_roles (
  id             uuid primary key default gen_random_uuid(),
  name           text not null check (length(btrim(name)) between 1 and 100),
  description    text not null default '',
  is_system_role boolean not null default false,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create unique index if not exists insp_roles_name_key on public.insp_roles (lower(btrim(name)));
drop trigger if exists insp_roles_touch on public.insp_roles;
create trigger insp_roles_touch before update on public.insp_roles
  for each row execute function public.touch_updated_at();

create table if not exists public.insp_role_permissions (
  role_id        uuid not null references public.insp_roles(id) on delete cascade,
  permission_key text not null references public.insp_permissions(key) on delete cascade,
  primary key (role_id, permission_key)
);

-- ---- 2) scope templates -------------------------------------------------------------
create table if not exists public.insp_scope_templates (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (length(btrim(name)) between 1 and 150),
  description text not null default '',
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create unique index if not exists insp_scope_templates_name_key on public.insp_scope_templates (lower(btrim(name)));
drop trigger if exists insp_scope_templates_touch on public.insp_scope_templates;
create trigger insp_scope_templates_touch before update on public.insp_scope_templates
  for each row execute function public.touch_updated_at();

create table if not exists public.insp_scope_template_items (
  id          uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.insp_scope_templates(id) on delete cascade,
  scope_type  text not null check (scope_type in ('Company','Unit')),
  company_id  uuid references public.insp_companies(id) on delete cascade,
  unit_id     uuid references public.units(id) on delete cascade,
  check ((scope_type = 'Company' and company_id is not null and unit_id is null)
      or (scope_type = 'Unit' and unit_id is not null and company_id is null))
);
create unique index if not exists insp_scope_template_items_key
  on public.insp_scope_template_items (template_id, scope_type, coalesce(company_id, unit_id));

-- ---- 3) user assignments ---------------------------------------------------------------
create table if not exists public.insp_user_roles (
  user_id    uuid not null references auth.users(id) on delete cascade,
  role_id    uuid not null references public.insp_roles(id) on delete cascade,
  granted_at timestamptz not null default now(),
  granted_by uuid references auth.users(id) default auth.uid(),
  primary key (user_id, role_id)
);
create table if not exists public.insp_user_scope_templates (
  user_id     uuid not null references auth.users(id) on delete cascade,
  template_id uuid not null references public.insp_scope_templates(id) on delete cascade,
  granted_at  timestamptz not null default now(),
  granted_by  uuid references auth.users(id) default auth.uid(),
  primary key (user_id, template_id)
);

-- ---- 4) access functions ------------------------------------------------------------------
create or replace function public.has_insp_perm(p text) returns boolean
  language sql security definer stable set search_path = public as
$$ select public.is_privileged()
     or exists (select 1 from public.insp_user_roles ur
                join public.insp_role_permissions rp on rp.role_id = ur.role_id
                where ur.user_id = auth.uid() and rp.permission_key = p) $$;

create or replace function public.insp_unit_ids() returns setof uuid
  language sql security definer stable set search_path = public as
$$ select u.id from public.units u
   where public.is_privileged()
      or exists (select 1 from public.insp_user_scope_templates ust
                 join public.insp_scope_templates t on t.id = ust.template_id and t.is_active
                 join public.insp_scope_template_items i on i.template_id = t.id
                 where ust.user_id = auth.uid()
                   and ((i.scope_type = 'Unit' and i.unit_id = u.id)
                     or (i.scope_type = 'Company' and i.company_id = u.company_id))) $$;

-- Everything the UI needs to gate itself: the caller's keys, units and privilege.
create or replace function public.insp_my_access() returns jsonb
  language sql security definer stable set search_path = public as
$$ select jsonb_build_object(
     'privileged', public.is_privileged(),
     'permissions', coalesce((select jsonb_agg(distinct rp.permission_key) from public.insp_user_roles ur
                              join public.insp_role_permissions rp on rp.role_id = ur.role_id
                              where ur.user_id = auth.uid()), '[]'::jsonb),
     'unitIds', coalesce((select jsonb_agg(x) from public.insp_unit_ids() x), '[]'::jsonb)) $$;

do $$ declare f text; begin
  foreach f in array array['has_insp_perm(text)','insp_unit_ids()','insp_my_access()'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

-- ---- RLS on the access tables ---------------------------------------------------------------
alter table public.insp_permissions          enable row level security;
alter table public.insp_roles                enable row level security;
alter table public.insp_role_permissions     enable row level security;
alter table public.insp_scope_templates      enable row level security;
alter table public.insp_scope_template_items enable row level security;
alter table public.insp_user_roles           enable row level security;
alter table public.insp_user_scope_templates enable row level security;

drop policy if exists insp_permissions_read on public.insp_permissions;
create policy insp_permissions_read on public.insp_permissions for select to authenticated using (true);

drop policy if exists insp_roles_read on public.insp_roles;
create policy insp_roles_read on public.insp_roles for select to authenticated
  using (public.has_insp_perm('role:view') or public.has_insp_perm('user:manage-access'));
drop policy if exists insp_roles_insert on public.insp_roles;
create policy insp_roles_insert on public.insp_roles for insert to authenticated with check (public.has_insp_perm('role:create'));
drop policy if exists insp_roles_update on public.insp_roles;
create policy insp_roles_update on public.insp_roles for update to authenticated
  using (public.has_insp_perm('role:update')) with check (public.has_insp_perm('role:update'));
drop policy if exists insp_roles_delete on public.insp_roles;
create policy insp_roles_delete on public.insp_roles for delete to authenticated
  using (public.has_insp_perm('role:delete') and not is_system_role);

drop policy if exists insp_role_perms_read on public.insp_role_permissions;
create policy insp_role_perms_read on public.insp_role_permissions for select to authenticated
  using (public.has_insp_perm('role:view') or role_id in (select role_id from public.insp_user_roles where user_id = auth.uid()));
drop policy if exists insp_role_perms_write on public.insp_role_permissions;
create policy insp_role_perms_write on public.insp_role_permissions for all to authenticated
  using (public.has_insp_perm('role:manage-permissions')) with check (public.has_insp_perm('role:manage-permissions'));

drop policy if exists insp_scope_tpl_read on public.insp_scope_templates;
create policy insp_scope_tpl_read on public.insp_scope_templates for select to authenticated
  using (public.has_insp_perm('user:manage-access') or id in (select template_id from public.insp_user_scope_templates where user_id = auth.uid()));
drop policy if exists insp_scope_tpl_write on public.insp_scope_templates;
create policy insp_scope_tpl_write on public.insp_scope_templates for all to authenticated
  using (public.has_insp_perm('user:manage-access')) with check (public.has_insp_perm('user:manage-access'));
drop policy if exists insp_scope_items_read on public.insp_scope_template_items;
create policy insp_scope_items_read on public.insp_scope_template_items for select to authenticated
  using (public.has_insp_perm('user:manage-access') or template_id in (select template_id from public.insp_user_scope_templates where user_id = auth.uid()));
drop policy if exists insp_scope_items_write on public.insp_scope_template_items;
create policy insp_scope_items_write on public.insp_scope_template_items for all to authenticated
  using (public.has_insp_perm('user:manage-access')) with check (public.has_insp_perm('user:manage-access'));

drop policy if exists insp_user_roles_read on public.insp_user_roles;
create policy insp_user_roles_read on public.insp_user_roles for select to authenticated
  using (user_id = auth.uid() or public.has_insp_perm('user:view'));
drop policy if exists insp_user_roles_write on public.insp_user_roles;
create policy insp_user_roles_write on public.insp_user_roles for all to authenticated
  using (public.has_insp_perm('user:manage-access')) with check (public.has_insp_perm('user:manage-access'));
drop policy if exists insp_user_scopes_read on public.insp_user_scope_templates;
create policy insp_user_scopes_read on public.insp_user_scope_templates for select to authenticated
  using (user_id = auth.uid() or public.has_insp_perm('user:view'));
drop policy if exists insp_user_scopes_write on public.insp_user_scope_templates;
create policy insp_user_scopes_write on public.insp_user_scope_templates for all to authenticated
  using (public.has_insp_perm('user:manage-access')) with check (public.has_insp_perm('user:manage-access'));

-- ---- 5a) data policies -------------------------------------------------------------------------
-- A legacy write-ALL policy becomes separate insert / update / delete policies.
create or replace function pg_temp.split_write(tbl text, pfx text, ins text, upd text, del text) returns void
  language plpgsql as $f$ begin
  execute format('drop policy if exists %I on public.%I', pfx || '_write', tbl);
  execute format('drop policy if exists %I on public.%I', pfx || '_insert', tbl);
  execute format('drop policy if exists %I on public.%I', pfx || '_update', tbl);
  execute format('drop policy if exists %I on public.%I', pfx || '_delete', tbl);
  execute format('create policy %I on public.%I for insert to authenticated with check (%s)', pfx || '_insert', tbl, ins);
  execute format('create policy %I on public.%I for update to authenticated using (%s) with check (%s)', pfx || '_update', tbl, upd, upd);
  if del is not null then
    execute format('create policy %I on public.%I for delete to authenticated using (%s)', pfx || '_delete', tbl, del);
  end if;
end $f$;

-- catalog: readable by anyone working with equipment, inspections or calibration
do $$ declare
  r text := 'public.has_insp_perm(''equipment:view'') or public.has_insp_perm(''equipment-category:view'')
     or public.has_insp_perm(''equipment-component:view'') or public.has_insp_perm(''inspection:view'')
     or public.has_insp_perm(''dashboard:view'') or public.has_insp_perm(''specification:view'')
     or public.has_insp_perm(''company:view'') or public.has_insp_perm(''calibration:view'')';
  t record;
begin
  for t in select * from (values
    ('insp_equipment_types','insp_types_read'), ('insp_equipment_parts','insp_parts_read'),
    ('insp_part_components','insp_components_read'), ('insp_specifications','insp_specs_read'),
    ('insp_companies','insp_companies_read')) v(tbl, pol) loop
    execute format('drop policy if exists %I on public.%I', t.pol, t.tbl);
    execute format('create policy %I on public.%I for select to authenticated using (%s)', t.pol, t.tbl, r);
  end loop;
end $$;

select pg_temp.split_write('insp_equipment_types', 'insp_types',
  $$public.has_insp_perm('equipment:create')$$,
  $$public.has_insp_perm('equipment:update') or public.has_insp_perm('equipment-category:update')$$,
  $$public.has_insp_perm('equipment:delete')$$);
select pg_temp.split_write('insp_equipment_parts', 'insp_parts',
  $$public.has_insp_perm('equipment-component:create')$$, $$public.has_insp_perm('equipment-component:update')$$,
  $$public.has_insp_perm('equipment-component:delete')$$);
select pg_temp.split_write('insp_part_components', 'insp_components',
  $$public.has_insp_perm('equipment-component:create')$$, $$public.has_insp_perm('equipment-component:update')$$,
  $$public.has_insp_perm('equipment-component:delete')$$);
select pg_temp.split_write('insp_specifications', 'insp_specs',
  $$public.has_insp_perm('specification:create')$$, $$public.has_insp_perm('specification:update')$$,
  $$public.has_insp_perm('specification:delete')$$);
select pg_temp.split_write('insp_companies', 'insp_companies',
  $$public.has_insp_perm('company:create')$$, $$public.has_insp_perm('company:update')$$,
  $$public.has_insp_perm('company:delete')$$);

-- inspection records — scoped by the user's scope templates
drop policy if exists insp_records_read on public.insp_records;
create policy insp_records_read on public.insp_records for select to authenticated
  using ((public.has_insp_perm('inspection:view') or public.has_insp_perm('dashboard:view'))
         and unit_id in (select public.insp_unit_ids()));
drop policy if exists insp_records_insert on public.insp_records;
create policy insp_records_insert on public.insp_records for insert to authenticated
  with check ((public.has_insp_perm('inspection:create') or public.has_insp_perm('inspection:import'))
              and unit_id in (select public.insp_unit_ids()));
drop policy if exists insp_records_update on public.insp_records;
create policy insp_records_update on public.insp_records for update to authenticated
  using ((public.has_insp_perm('inspection:update') or public.has_insp_perm('inspection:import'))
         and unit_id in (select public.insp_unit_ids()))
  with check ((public.has_insp_perm('inspection:update') or public.has_insp_perm('inspection:import'))
              and unit_id in (select public.insp_unit_ids()));
drop policy if exists insp_records_delete on public.insp_records;
create policy insp_records_delete on public.insp_records for delete to authenticated
  using (public.has_insp_perm('inspection:delete') and unit_id in (select public.insp_unit_ids()));

drop policy if exists insp_record_logs_read on public.insp_record_logs;
create policy insp_record_logs_read on public.insp_record_logs for select to authenticated
  using (public.has_insp_perm('inspection:view'));

-- file rows (inspection files, library, shared documents, P&ID share insp_files)
drop policy if exists insp_files_read on public.insp_files;
create policy insp_files_read on public.insp_files for select to authenticated
  using (public.has_insp_perm('inspection:view') or public.has_insp_perm('library:view')
         or public.has_insp_perm('shared-document:view') or public.has_insp_perm('pid:view'));
select pg_temp.split_write('insp_files', 'insp_files',
  $$public.has_insp_perm('inspection-file:upload') or public.has_insp_perm('library:create')
    or public.has_insp_perm('shared-document:create') or public.has_insp_perm('pid:create')$$,
  $$public.has_insp_perm('inspection-file:upload') or public.has_insp_perm('library:create')
    or public.has_insp_perm('shared-document:create') or public.has_insp_perm('pid:update')$$,
  $$public.has_insp_perm('inspection-file:delete') or public.has_insp_perm('library:delete')
    or public.has_insp_perm('shared-document:delete') or public.has_insp_perm('pid:delete')$$);

-- vendor companies (no delete in the reference)
drop policy if exists insp_vendor_read on public.insp_vendor_companies;
create policy insp_vendor_read on public.insp_vendor_companies for select to authenticated
  using (public.has_insp_perm('vendor-company:view') or public.has_insp_perm('inspection:view')
         or public.has_insp_perm('calibration:view'));
select pg_temp.split_write('insp_vendor_companies', 'insp_vendor',
  $$public.has_insp_perm('vendor-company:create')$$, $$public.has_insp_perm('vendor-company:update')$$, null);

-- calibration
drop policy if exists insp_cal_registers_read on public.insp_cal_registers;
create policy insp_cal_registers_read on public.insp_cal_registers for select to authenticated
  using (public.has_insp_perm('calibration:view') and unit_id in (select public.insp_unit_ids()));
select pg_temp.split_write('insp_cal_registers', 'insp_cal_registers',
  $$(public.has_insp_perm('calibration:create') or public.has_insp_perm('calibration:import')) and unit_id in (select public.insp_unit_ids())$$,
  $$(public.has_insp_perm('calibration:update') or public.has_insp_perm('calibration:import')) and unit_id in (select public.insp_unit_ids())$$,
  $$public.has_insp_perm('calibration:delete') and unit_id in (select public.insp_unit_ids())$$);
drop policy if exists insp_cal_instruments_read on public.insp_cal_instruments;
create policy insp_cal_instruments_read on public.insp_cal_instruments for select to authenticated
  using (public.has_insp_perm('calibration:view') and public.insp_cal_can_see_register(register_id));
select pg_temp.split_write('insp_cal_instruments', 'insp_cal_instruments',
  $$(public.has_insp_perm('calibration:create') or public.has_insp_perm('calibration:import')) and public.insp_cal_can_see_register(register_id)$$,
  $$(public.has_insp_perm('calibration:update') or public.has_insp_perm('calibration:import')
     or public.has_insp_perm('calibration:file-upload')) and public.insp_cal_can_see_register(register_id)$$,
  $$public.has_insp_perm('calibration:delete') and public.insp_cal_can_see_register(register_id)$$);
drop policy if exists insp_cal_tmmd_read on public.insp_cal_tmmd_map;
create policy insp_cal_tmmd_read on public.insp_cal_tmmd_map for select to authenticated
  using (public.has_insp_perm('calibration:view'));
select pg_temp.split_write('insp_cal_tmmd_map', 'insp_cal_tmmd',
  $$public.has_insp_perm('calibration:update')$$, $$public.has_insp_perm('calibration:update')$$,
  $$public.has_insp_perm('calibration:update')$$);

drop policy if exists insp_audit_read on public.insp_audit_log;
create policy insp_audit_read on public.insp_audit_log for select to authenticated
  using (public.has_insp_perm('audit:view'));

-- ---- 5b) storage -----------------------------------------------------------------------------------
drop policy if exists insp_files_obj_read on storage.objects;
create policy insp_files_obj_read on storage.objects for select to authenticated
  using ((bucket_id = 'inspection-files' and (public.has_insp_perm('inspection-file:download')
            or public.has_insp_perm('shared-document:view') or public.has_insp_perm('pid:view')))
      or (bucket_id = 'inspection-library' and public.has_insp_perm('library:download')));
drop policy if exists insp_files_obj_write on storage.objects;
create policy insp_files_obj_write on storage.objects for insert to authenticated
  with check ((bucket_id = 'inspection-files' and (public.has_insp_perm('inspection-file:upload')
                 or public.has_insp_perm('shared-document:create') or public.has_insp_perm('pid:create')))
           or (bucket_id = 'inspection-library' and public.has_insp_perm('library:create')));
drop policy if exists insp_files_obj_delete on storage.objects;
create policy insp_files_obj_delete on storage.objects for delete to authenticated
  using ((bucket_id = 'inspection-files' and (public.has_insp_perm('inspection-file:delete')
            or public.has_insp_perm('shared-document:delete') or public.has_insp_perm('pid:delete')))
      or (bucket_id = 'inspection-library' and public.has_insp_perm('library:delete')));

drop policy if exists insp_cal_cert_read on storage.objects;
create policy insp_cal_cert_read on storage.objects for select to authenticated
  using (bucket_id = 'calibration-certificates' and public.has_insp_perm('calibration:file-download')
         and public.insp_cal_can_see_register(((storage.foldername(name))[1])::uuid));
drop policy if exists insp_cal_cert_write on storage.objects;
create policy insp_cal_cert_write on storage.objects for insert to authenticated
  with check (bucket_id = 'calibration-certificates' and public.has_insp_perm('calibration:file-upload')
              and public.insp_cal_can_see_register(((storage.foldername(name))[1])::uuid));
drop policy if exists insp_cal_cert_update on storage.objects;
create policy insp_cal_cert_update on storage.objects for update to authenticated
  using (bucket_id = 'calibration-certificates' and public.has_insp_perm('calibration:file-upload')
         and public.insp_cal_can_see_register(((storage.foldername(name))[1])::uuid));
drop policy if exists insp_cal_cert_delete on storage.objects;
create policy insp_cal_cert_delete on storage.objects for delete to authenticated
  using (bucket_id = 'calibration-certificates'
         and (public.has_insp_perm('calibration:file-upload') or public.has_insp_perm('calibration:delete'))
         and public.insp_cal_can_see_register(((storage.foldername(name))[1])::uuid));

-- ---- 5c) RPC bodies: swap the legacy keys and the unit scope in place ---------------------------------
do $$
declare
  fn record; def text; i int;
  swaps text[][] := array[
    array['has_insp_perm(''insp_data_entry'')', 'has_insp_perm(''inspection:update'')'],
    array['has_insp_perm(''insp_upload'')',     'has_insp_perm(''inspection:import'')'],
    array['has_insp_perm(''insp_approve'')',    'has_insp_perm(''inspection:approve'')'],
    array['public.has_insp_perm(''insp_view'')', '(public.has_insp_perm(''inspection:view'') or public.has_insp_perm(''dashboard:view''))'],
    array['has_insp_perm(''insp_view'')',       '(public.has_insp_perm(''inspection:view'') or public.has_insp_perm(''dashboard:view''))'],
    array['assigned_unit_ids()',                'insp_unit_ids()']];
begin
  for fn in select p.oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname in ('insp_bulk_update_dates','insp_dashboard','insp_import_records',
              'insp_notification_summary','insp_set_approval','insp_sync_reference','insp_cal_can_see_register') loop
    def := pg_get_functiondef(fn.oid);
    for i in 1 .. array_length(swaps, 1) loop
      def := replace(def, swaps[i][1], swaps[i][2]);
    end loop;
    if def ~ 'has_insp_perm\(''insp_' then
      raise exception 'unmapped legacy permission left in %', fn.oid::regprocedure;
    end if;
    execute def;
  end loop;
end $$;
