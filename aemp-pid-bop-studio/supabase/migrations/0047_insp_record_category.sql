-- ============================================================================
--  0047 — Record-level category, like the reference: a record may carry its
--  own category that differs from its equipment type's (the export has
--  equipment types whose records are split across categories).
--    · insp_records.category  — null = inherit the type's category
--    · insp_records_expanded.category = coalesce(record, type)
--    · insp_sync_reference stores the export category only when it differs
--      from the type's, so ordinary records keep inheriting
-- ============================================================================
alter table public.insp_records add column if not exists category public.insp_category;

create or replace view public.insp_records_expanded with (security_invoker = true) as
 select r.id, r.type_id, r.part_id, r.component_id, r.unit_id, r.company_id,
    r.component_description, r.oem, r.inspection_company, r.serial_number, r.part_number,
    r.working_status, r.manufacture_year, r.intermediate_date, r.intermediate_freq_months,
    r.intermediate_due_date, r.major_date, r.major_freq_months, r.major_due_date,
    r.remarks, r.specs, r.approve_status, r.approver_id, r.reject_reason,
    r.approved_at, r.approved_by, r.created_by, r.created_at, r.updated_at,
    coalesce(r.category, t.category) as category,
    t.name as type_name, t.spec_fields,
    p.name as part_name, c.name as component_name, u.name as unit_name, co.name as company_name,
    r.approval_requested_by, r.approval_requested_for, r.approval_requested_at,
    r.approved_by_name, r.elastomer_description, r.inspection_report,
    r.category as record_category
   from public.insp_records r
     join public.insp_equipment_types t on t.id = r.type_id
     left join public.insp_equipment_parts p on p.id = r.part_id
     left join public.insp_part_components c on c.id = r.component_id
     join public.units u on u.id = r.unit_id
     left join public.insp_companies co on co.id = r.company_id;

-- Same body as before plus v_cat (export category when it differs from the type's).
do $do$
declare src text;
begin
  select pg_get_functiondef(p.oid) into src from pg_proc p
   where p.proname = 'insp_sync_reference' and p.pronamespace = 'public'::regnamespace;
  if src is null or position('v_cat' in src) > 0 then return; end if;
  src := replace(src, 'r jsonb; v_id uuid;', 'r jsonb; v_id uuid; v_cat public.insp_category;');
  src := replace(src, E'    v_id := null;\n',
    E'    v_id := null;\n    select nullif((r->>''category'')::public.insp_category, t.category) into v_cat\n      from public.insp_equipment_types t where t.id = (r->>''type_id'')::uuid;\n');
  src := replace(src, 'approved_by_name, approved_at, created_by)', 'approved_by_name, approved_at, created_by, category)');
  src := replace(src, '(r->>''approved_at'')::timestamptz, auth.uid());', '(r->>''approved_at'')::timestamptz, auth.uid(), v_cat);');
  src := replace(src, E'        reject_reason = null,\n', E'        category = v_cat,\n        reject_reason = null,\n');
  if (length(src) - length(replace(src, 'v_cat', ''))) / 5 <> 4 then
    raise exception 'insp_sync_reference patch did not apply cleanly';
  end if;
  execute src;
end $do$;
