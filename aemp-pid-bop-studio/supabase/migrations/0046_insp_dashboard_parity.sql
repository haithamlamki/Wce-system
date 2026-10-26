-- ============================================================================
--  0046 — Dashboard formulas aligned with the reference /api/dashboard/*:
--    · Compliance by Rig  = (obligations − overdue) / obligations per unit
--    · Distribution       = obligation counts (total / overdue / due ≤30d)
--    · Frequency Mix      = a frequency counts only where its due date exists
--    · Inspection Kind    = also reports due-soon
--    · Avg approval       = approved date − requested date, in days, over
--                           non-negative durations with both dates present
--    · distinct OEMs      = case-insensitive, blanks excluded
--  An "obligation" is one non-null due date (intermediate or major).
-- ============================================================================
create or replace function public.insp_dashboard_stats(p_today date default current_date)
returns jsonb language sql stable set search_path to 'public' as
$function$
with base as (
  select e.*, (e.intermediate_due_date - p_today) as i_days, (e.major_due_date - p_today) as m_days
  from public.insp_records_expanded e
),
scored as (
  select b.*, least(
      coalesce(case when b.i_days is null then 3 when b.i_days < 0 then 0 when b.i_days <= 30 then 1 else 2 end, 3),
      coalesce(case when b.m_days is null then 3 when b.m_days < 0 then 0 when b.m_days <= 30 then 1 else 2 end, 3)) as rag
  from base b
),
obl as (
  select unit_name, category, approve_status, months, days from (
    select unit_name, category, approve_status, intermediate_freq_months as months, i_days as days from base
    union all
    select unit_name, category, approve_status, major_freq_months, m_days from base) x
  where days is not null
),
dd as (select days from obl)
select jsonb_build_object(
  'total', (select count(*) from base),
  'scheduled', (select count(*) from scored where rag <> 3),
  'overdue', (select count(*) from scored where rag = 0),
  'dueSoon', (select count(*) from scored where rag = 1),
  'compliant', (select count(*) from scored where rag = 2),
  'obligations', (select count(*) from dd),
  'worstOverdueDays', coalesce((select max(-days) from dd where days < 0), 0),
  'aging', jsonb_build_object(
    '1-30', (select count(*) from dd where days < 0 and -days <= 30),
    '31-60', (select count(*) from dd where days < 0 and -days between 31 and 60),
    '60+', (select count(*) from dd where days < 0 and -days > 60)),
  'forecast', jsonb_build_object(
    'Next 30', (select count(*) from dd where days between 0 and 30),
    '31-60', (select count(*) from dd where days between 31 and 60),
    '61-90', (select count(*) from dd where days between 61 and 90)),
  'rigCompliance', (select coalesce(jsonb_agg(jsonb_build_object('label', label, 'value', pct) order by pct, label), '[]'::jsonb)
     from (select unit_name as label, round(100.0 * count(*) filter (where days >= 0) / count(*)) as pct
           from obl group by unit_name) r),
  'byCategory', (select coalesce(jsonb_agg(jsonb_build_object('label', label, 'compliant', c, 'dueSoon', d, 'overdue', o)), '[]'::jsonb)
     from (select category::text as label, count(*) filter (where days > 30) c,
                  count(*) filter (where days between 0 and 30) d, count(*) filter (where days < 0) o
           from obl group by 1 order by count(*) desc limit 12) s),
  'byRig', (select coalesce(jsonb_agg(jsonb_build_object('label', label, 'compliant', c, 'dueSoon', d, 'overdue', o)), '[]'::jsonb)
     from (select unit_name as label, count(*) filter (where days > 30) c,
                  count(*) filter (where days between 0 and 30) d, count(*) filter (where days < 0) o
           from obl group by 1 order by count(*) desc limit 12) s),
  'byStatus', (select coalesce(jsonb_agg(jsonb_build_object('label', label, 'compliant', c, 'dueSoon', d, 'overdue', o)), '[]'::jsonb)
     from (select case when approve_status = 'approved' then 'Approved' else 'Pending Approval' end as label,
                  count(*) filter (where days > 30) c, count(*) filter (where days between 0 and 30) d,
                  count(*) filter (where days < 0) o
           from obl group by 1) s),
  'kind', jsonb_build_array(
    jsonb_build_object('label','Intermediate','total',(select count(*) from base where i_days is not null),
      'overdue',(select count(*) from base where i_days < 0),
      'dueSoon',(select count(*) from base where i_days between 0 and 30)),
    jsonb_build_object('label','Major','total',(select count(*) from base where m_days is not null),
      'overdue',(select count(*) from base where m_days < 0),
      'dueSoon',(select count(*) from base where m_days between 0 and 30))),
  'frequency', (select coalesce(jsonb_agg(jsonb_build_object('months', months, 'onTrack', ok, 'overdue', od, 'total', tot)), '[]'::jsonb)
     from (select months, count(*) filter (where days >= 0) ok, count(*) filter (where days < 0) od, count(*) tot
           from obl where months is not null group by months order by count(*) desc) g),
  'ageBuckets', (select coalesce(jsonb_object_agg(bucket, n), '{}'::jsonb) from (
      select case when manufacture_year is null then 'Unknown'
                  when extract(year from p_today) - manufacture_year <= 5 then '0-5'
                  when extract(year from p_today) - manufacture_year <= 10 then '6-10'
                  when extract(year from p_today) - manufacture_year <= 15 then '11-15'
                  when extract(year from p_today) - manufacture_year <= 20 then '16-20'
                  else '20+' end as bucket, count(*) as n from base group by 1) a),
  'avgAge', coalesce((select round(avg(extract(year from p_today) - manufacture_year), 1) from base where manufacture_year is not null), 0),
  'oemCount', (select count(distinct lower(btrim(oem))) from base where btrim(coalesce(oem, '')) <> ''),
  'oemTop', (select coalesce(jsonb_agg(jsonb_build_object('label', label, 'value', n)), '[]'::jsonb)
     from (select coalesce(nullif(btrim(oem), ''), 'Unspecified') as label, count(*) as n
           from base group by 1 order by count(*) desc limit 12) o),
  'trend', (select coalesce(jsonb_agg(jsonb_build_object('month', mon, 'intermediate', i, 'major', mj)), '[]'::jsonb)
     from (select to_char(m, 'YYYY-MM') as mon,
                  (select count(*) from base where date_trunc('month', intermediate_date) = m) as i,
                  (select count(*) from base where date_trunc('month', major_date) = m) as mj
           from generate_series(date_trunc('month', p_today::timestamp) - interval '11 months',
                                date_trunc('month', p_today::timestamp), interval '1 month') m
           order by m) t),
  'pending', (select count(*) from base where approve_status = 'pending_approval'),
  'approved', (select count(*) from base where approve_status = 'approved'),
  'avgApprovalDays', (select round(avg(d)::numeric, 1) from (
       select (approved_at::date - approval_requested_at::date) as d from base
       where approved_at is not null and approval_requested_at is not null) a where d >= 0),
  'approvedLast30', (select count(*) from base where approved_at >= (p_today - 30)),
  'quality', jsonb_build_object(
    'Due date', (select count(*) from base where intermediate_due_date is null and major_due_date is null),
    'Serial', (select count(*) from base where btrim(coalesce(serial_number, '')) = ''),
    'Frequency', (select count(*) from base where intermediate_freq_months is null and major_freq_months is null),
    'Manuf. year', (select count(*) from base where manufacture_year is null),
    'OEM', (select count(*) from base where btrim(coalesce(oem, '')) = ''))
);
$function$;
