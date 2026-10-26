-- ============================================================================
--  0045 — Audit Logs + App Logs, mirroring the reference Administration
--  screens (/admin/audit-logs, /admin/logs).
--
--    1. insp_audit_events — one row per create / update / delete on the
--       inspection catalog, records, calibration, vendors and access tables,
--       written by a generic trigger; updates carry a column diff in the
--       reference shape [{column, oldValue, newValue}]
--    2. insp_app_logs     — warnings / errors (client errors via
--       insp_log_client_error, server-side notifier failures)
--  Both are read-only to clients: audit:view / log:view. source_id keeps the
--  reference row id for imported history.
-- ============================================================================

-- ---- 1) audit events ----------------------------------------------------------------
create table if not exists public.insp_audit_events (
  id           bigint generated always as identity primary key,
  source_id    integer unique,
  user_id      uuid references auth.users(id) on delete set null,
  user_name    text not null default 'System',
  action       text not null check (action in ('Create','Update','Delete')),
  entity_type  text not null,
  entity_id    text not null,
  entity_label text,
  changes      jsonb,
  created_at   timestamptz not null default now()
);
create index if not exists insp_audit_events_created_idx on public.insp_audit_events (created_at desc);
create index if not exists insp_audit_events_entity_idx on public.insp_audit_events (entity_type, entity_id);

-- TG_ARGV: [0] entity type, [1] label column, [2] key columns (comma separated)
create or replace function public.insp_audit_trigger() returns trigger
  language plpgsql security definer set search_path = public as
$$
declare
  o jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  n jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
  r jsonb := coalesce(n, o);
  diff jsonb;
  who text;
begin
  if tg_op = 'UPDATE' then
    select jsonb_agg(jsonb_build_object('column', k, 'oldValue', o ->> k, 'newValue', n ->> k) order by k)
      into diff
      from jsonb_object_keys(n) k
     where k not in ('updated_at', 'created_at') and (o -> k) is distinct from (n -> k);
    if diff is null then return null; end if;
  end if;
  select coalesce(nullif(btrim(p.full_name), ''), p.email) into who from public.profiles p where p.id = auth.uid();
  insert into public.insp_audit_events (user_id, user_name, action, entity_type, entity_id, entity_label, changes)
  values (auth.uid(), coalesce(who, 'System'),
          case tg_op when 'INSERT' then 'Create' when 'UPDATE' then 'Update' else 'Delete' end,
          tg_argv[0],
          (select string_agg(r ->> btrim(c), ':') from unnest(string_to_array(tg_argv[2], ',')) c),
          left(r ->> tg_argv[1], 300), diff);
  return null;
end $$;
revoke all on function public.insp_audit_trigger() from public, anon, authenticated;

do $$ declare t record; begin
  for t in select * from (values
    ('insp_records',              'InspectionRecord',       'serial_number', 'id'),
    ('insp_equipment_types',      'Equipment',              'name',          'id'),
    ('insp_equipment_parts',      'EquipmentPart',          'name',          'id'),
    ('insp_part_components',      'EquipmentPartComponent', 'name',          'id'),
    ('insp_specifications',       'Specification',          'measurement',   'id'),
    ('insp_companies',            'Company',                'name',          'id'),
    ('insp_cal_registers',        'CalibrationRegister',    'title',         'id'),
    ('insp_cal_instruments',      'CalibrationRecord',      'instrument',    'id'),
    ('insp_vendor_companies',     'VendorCompany',          'name',          'id'),
    ('insp_roles',                'Role',                   'name',          'id'),
    ('insp_role_permissions',     'RolePermission',         'permission_key','role_id,permission_key'),
    ('insp_scope_templates',      'ScopeTemplate',          'name',          'id'),
    ('insp_scope_template_items', 'ScopeItem',              'scope_type',    'id'),
    ('insp_user_roles',           'UserRole',               'role_id',       'user_id,role_id'),
    ('insp_user_scope_templates', 'UserScopeTemplate',      'template_id',   'user_id,template_id')
  ) v(tbl, ent, lbl, keys) loop
    execute format('drop trigger if exists insp_audit on public.%I', t.tbl);
    execute format('create trigger insp_audit after insert or update or delete on public.%I
                    for each row execute function public.insp_audit_trigger(%L, %L, %L)', t.tbl, t.ent, t.lbl, t.keys);
  end loop;
end $$;

alter table public.insp_audit_events enable row level security;
drop policy if exists insp_audit_events_read on public.insp_audit_events;
create policy insp_audit_events_read on public.insp_audit_events for select to authenticated
  using (public.has_insp_perm('audit:view'));

-- ---- 2) app logs ------------------------------------------------------------------------
create table if not exists public.insp_app_logs (
  id         bigint generated always as identity primary key,
  source_id  integer unique,
  level      text not null check (level in ('Information','Warning','Error')),
  message    text not null,
  source     text,
  exception  text,
  user_id    uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists insp_app_logs_created_idx on public.insp_app_logs (created_at desc);

alter table public.insp_app_logs enable row level security;
drop policy if exists insp_app_logs_read on public.insp_app_logs;
create policy insp_app_logs_read on public.insp_app_logs for select to authenticated
  using (public.has_insp_perm('log:view'));

-- Client-side error reporting: any signed-in user may write a bounded row.
create or replace function public.insp_log_client_error(p_message text, p_exception text default null,
                                                        p_level text default 'Error')
returns void language plpgsql security definer set search_path = public as
$$ begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  insert into public.insp_app_logs (level, message, source, exception, user_id)
  values (case when p_level in ('Warning','Error') then p_level else 'Error' end,
          left(coalesce(nullif(btrim(p_message), ''), '(no message)'), 1000), 'ClientError',
          left(p_exception, 8000), auth.uid());
end $$;
revoke all on function public.insp_log_client_error(text, text, text) from public, anon;
grant execute on function public.insp_log_client_error(text, text, text) to authenticated;
