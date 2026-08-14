-- ============================================================================
--  0035_expanded_view_approval_columns.sql
--
--  Repairs a defect in 0034.
--
--  0034 added approved_at / approved_by to insp_records, but
--  insp_records_expanded was created in 0030 as `select r.*, …`. Postgres
--  expands `r.*` to an explicit column list AT VIEW CREATION TIME, so the view
--  kept its original 34 columns and never exposed the two new ones. Every
--  client query naming approved_at/approved_by therefore failed with HTTP 400
--  — which broke the dashboard and the notification bell.
--
--  CREATE OR REPLACE VIEW cannot fix this: it may only append columns at the
--  end, and r.* places the new columns in the middle. The view is therefore
--  dropped and recreated with the columns listed explicitly, so a future column
--  addition fails loudly at review time instead of silently going missing.
--
--  security_invoker = true is preserved: the view continues to run with the
--  caller's privileges, so the RLS policies on insp_records still apply.
-- ============================================================================

drop view if exists public.insp_records_expanded;

create view public.insp_records_expanded
  with (security_invoker = true) as
select
  r.id,
  r.type_id,
  r.part_id,
  r.component_id,
  r.unit_id,
  r.company_id,
  r.component_description,
  r.oem,
  r.inspection_company,
  r.serial_number,
  r.part_number,
  r.working_status,
  r.manufacture_year,
  r.intermediate_date,
  r.intermediate_freq_months,
  r.intermediate_due_date,
  r.major_date,
  r.major_freq_months,
  r.major_due_date,
  r.remarks,
  r.specs,
  r.approve_status,
  r.approver_id,
  r.reject_reason,
  r.approved_at,
  r.approved_by,
  r.created_by,
  r.created_at,
  r.updated_at,
  t.category,
  t.name        as type_name,
  t.spec_fields,
  p.name        as part_name,
  c.name        as component_name,
  u.name        as unit_name,
  co.name       as company_name
from public.insp_records r
  join      public.insp_equipment_types  t  on t.id = r.type_id
  left join public.insp_equipment_parts  p  on p.id = r.part_id
  left join public.insp_part_components  c  on c.id = r.component_id
  join      public.units                 u  on u.id = r.unit_id
  left join public.insp_companies        co on co.id = r.company_id;

grant select on public.insp_records_expanded to authenticated;
revoke all on public.insp_records_expanded from anon;
