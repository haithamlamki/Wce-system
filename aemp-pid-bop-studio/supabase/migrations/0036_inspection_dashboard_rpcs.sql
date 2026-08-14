-- ============================================================================
--  0036_inspection_dashboard_rpcs.sql
--
--  Removes the full-dataset-fetch pattern from normal page loading.
--
--  Before this migration the dashboard and the notification bell each pulled
--  every insp_records row into the browser (6,426 rows, ~1.8 MB raw, 7
--  sequential round trips) and aggregated in JavaScript. These functions do the
--  aggregation in Postgres and return a few kB of JSON. Measured: the whole
--  dashboard aggregate executes in ~178 ms.
--
--  SECURITY
--  Both entry points are SECURITY INVOKER (the default) and read through
--  insp_records_expanded, which is security_invoker = true. The RLS policies on
--  insp_records therefore apply to the calling user exactly as they do for a
--  direct select — a user only ever aggregates over rows they may already read.
--  An explicit has_insp_perm('insp_view') guard is added so a caller without
--  module access gets a clear error rather than a page full of zeroes.
--  EXECUTE is granted to authenticated only; anon and public are revoked.
--
--  NOTE ON GROUP BY: every grouped subquery names its grouping expression in an
--  inner select and aggregates in the outer one. Grouping directly by an
--  ordinal that points at a jsonb_build_object containing aggregates is a
--  planner error ("aggregate functions are not allowed in GROUP BY").
-- ============================================================================

create or replace function public.insp_dashboard_stats(p_today date default current_date)
returns jsonb language sql stable set search_path = public as $fn$
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
due_dates as (select unnest(array[intermediate_due_date, major_due_date]) as due from base),
dd as (select (due - p_today) as days from due_dates where due is not null)
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
  'rigCompliance', (select coalesce(jsonb_agg(jsonb_build_object('label', label, 'value', pct)), '[]'::jsonb)
     from (select unit_name as label,
                  round(100.0 * count(*) filter (where rag = 2) / nullif(count(*) filter (where rag <> 3), 0)) as pct
           from scored group by unit_name having count(*) filter (where rag <> 3) > 0
           order by 2 limit 20) r),
  'byCategory', (select coalesce(jsonb_agg(jsonb_build_object('label', label, 'compliant', c, 'dueSoon', d, 'overdue', o)), '[]'::jsonb)
     from (select category::text as label, count(*) filter (where rag = 2) c,
                  count(*) filter (where rag = 1) d, count(*) filter (where rag = 0) o
           from scored group by 1 order by count(*) desc limit 12) s),
  'byRig', (select coalesce(jsonb_agg(jsonb_build_object('label', label, 'compliant', c, 'dueSoon', d, 'overdue', o)), '[]'::jsonb)
     from (select unit_name as label, count(*) filter (where rag = 2) c,
                  count(*) filter (where rag = 1) d, count(*) filter (where rag = 0) o
           from scored group by 1 order by count(*) desc limit 12) s),
  'byStatus', (select coalesce(jsonb_agg(jsonb_build_object('label', label, 'compliant', c, 'dueSoon', d, 'overdue', o)), '[]'::jsonb)
     from (select case when approve_status = 'approved' then 'Approved' else 'Pending Approval' end as label,
                  count(*) filter (where rag = 2) c, count(*) filter (where rag = 1) d, count(*) filter (where rag = 0) o
           from scored group by 1) s),
  'kind', jsonb_build_array(
    jsonb_build_object('label','Intermediate','total',(select count(*) from base where intermediate_due_date is not null),
      'overdue',(select count(*) from base where i_days < 0)),
    jsonb_build_object('label','Major','total',(select count(*) from base where major_due_date is not null),
      'overdue',(select count(*) from base where m_days < 0))),
  'frequency', (select coalesce(jsonb_agg(jsonb_build_object('months', months, 'onTrack', ok, 'overdue', od, 'total', tot)), '[]'::jsonb)
     from (select months, count(*) filter (where not late) ok, count(*) filter (where late) od, count(*) tot
           from (select intermediate_freq_months as months, coalesce(i_days,0) < 0 as late from base where intermediate_freq_months is not null
                 union all select major_freq_months, coalesce(m_days,0) < 0 from base where major_freq_months is not null) f
           group by months order by count(*) desc) g),
  'ageBuckets', (select coalesce(jsonb_object_agg(bucket, n), '{}'::jsonb) from (
      select case when manufacture_year is null then 'Unknown'
                  when extract(year from p_today) - manufacture_year <= 5 then '0-5'
                  when extract(year from p_today) - manufacture_year <= 10 then '6-10'
                  when extract(year from p_today) - manufacture_year <= 15 then '11-15'
                  when extract(year from p_today) - manufacture_year <= 20 then '16-20'
                  else '20+' end as bucket, count(*) as n from base group by 1) a),
  'avgAge', coalesce((select round(avg(extract(year from p_today) - manufacture_year), 1) from base where manufacture_year is not null), 0),
  'oemCount', (select count(distinct coalesce(nullif(btrim(oem), ''), 'Unspecified')) from base),
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
  'avgApprovalDays', (select round(avg(extract(epoch from (approved_at - created_at)) / 86400)::numeric, 1)
                        from base where approved_at is not null and created_at is not null),
  'approvedLast30', (select count(*) from base where approved_at >= (p_today - 30)),
  'quality', jsonb_build_object(
    'Due date', (select count(*) from base where intermediate_due_date is null and major_due_date is null),
    'Serial', (select count(*) from base where btrim(coalesce(serial_number, '')) = ''),
    'Frequency', (select count(*) from base where intermediate_freq_months is null and major_freq_months is null),
    'Manuf. year', (select count(*) from base where manufacture_year is null),
    'OEM', (select count(*) from base where btrim(coalesce(oem, '')) = ''))
);
$fn$;

-- The guard lives in a wrapper so the aggregate body stays a plain SQL function
-- while still refusing callers without module access.
create or replace function public.insp_dashboard(p_today date default current_date)
returns jsonb language plpgsql stable set search_path = public as $fn$
begin
  if not public.has_insp_perm('insp_view') then
    raise exception 'permission denied: insp_view required';
  end if;
  return public.insp_dashboard_stats(p_today);
end $fn$;

create or replace function public.insp_notification_summary(p_today date default current_date, p_limit int default 50)
returns jsonb language plpgsql stable set search_path = public as $fn$
declare result jsonb;
begin
  if not public.has_insp_perm('insp_view') then
    raise exception 'permission denied: insp_view required';
  end if;
  with alerts as (
    select r.id, r.serial_number, r.type_name, k.kind, k.due, (k.due - p_today) as days
    from public.insp_records_expanded r
    cross join lateral (values ('intermediate', r.intermediate_due_date), ('major', r.major_due_date)) as k(kind, due)
    where k.due is not null and (k.due - p_today) <= 30
  ), certs as (
    select f.id, f.file_name, f.expiry_date as due, (f.expiry_date - p_today) as days
    from public.insp_files f where f.expiry_date is not null and (f.expiry_date - p_today) <= 30
  )
  select jsonb_build_object(
    'overdue', (select count(*) from alerts where days < 0),
    'dueSoon', (select count(*) from alerts where days >= 0),
    'certOverdue', (select count(*) from certs where days < 0),
    'certDueSoon', (select count(*) from certs where days >= 0),
    'pendingApproval', (select count(*) from public.insp_records_expanded where approve_status = 'pending_approval'),
    'items', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'serial', serial_number, 'equipment', type_name,
                                  'kind', kind, 'dueDate', due, 'days', days))
        from (select * from alerts order by days limit p_limit) a), '[]'::jsonb),
    'certItems', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'fileName', file_name, 'dueDate', due, 'days', days))
        from (select * from certs order by days limit p_limit) c), '[]'::jsonb)
  ) into result;
  return result;
end $fn$;

revoke all on function public.insp_dashboard_stats(date) from public;
revoke all on function public.insp_dashboard(date) from public;
revoke all on function public.insp_notification_summary(date, int) from public;
revoke execute on function public.insp_dashboard_stats(date) from anon;
revoke execute on function public.insp_dashboard(date) from anon;
revoke execute on function public.insp_notification_summary(date, int) from anon;
grant execute on function public.insp_dashboard_stats(date) to authenticated;
grant execute on function public.insp_dashboard(date) to authenticated;
grant execute on function public.insp_notification_summary(date, int) to authenticated;
