-- ============================================================================
--  0034_inspection_approval_audit.sql
--
--  Fixes a data-loss defect in the approval workflow.
--
--  PROBLEM
--  0030's insp_set_approval() executed `approver_id = auth.uid()`, overwriting
--  the approver chosen at data entry ("Send to approver"). One column therefore
--  carried two different meanings, and the routing target was destroyed the
--  moment a record was approved. There was also no record of WHEN an approval
--  happened, so approval turnaround could not be measured at all.
--
--  FIX
--  Separate the two meanings:
--    approver_id  — who the record was SENT TO (set at entry, never overwritten)
--    approved_by  — who actually approved it (set by the RPC)
--    approved_at  — when they approved it (set by the RPC)
--
--  BACKFILL
--  Every existing approved row has approver_id holding the APPROVER (that is
--  what the old RPC wrote), so it is copied into approved_by. The original
--  routing target for those rows was already lost before this migration and
--  cannot be recovered — approver_id is left in place rather than cleared, so
--  no information is destroyed by this change either.
--
--  approved_at is NOT backfilled: no approval timestamp was ever stored, and
--  updated_at changes on any edit, so using it would fabricate history.
--  Historic rows keep a null approved_at and are excluded from turnaround
--  metrics, which report only on approvals recorded from this migration on.
--
--  Additive and idempotent. No RLS policy changes; the RPC keeps its existing
--  insp_approve guard and SECURITY DEFINER search_path.
-- ============================================================================

alter table public.insp_records
  add column if not exists approved_at timestamptz,
  add column if not exists approved_by uuid references auth.users(id);

comment on column public.insp_records.approver_id is
  'Who the record was sent to for approval. Set at data entry; never overwritten by approval.';
comment on column public.insp_records.approved_by is
  'Who actually approved the record. Null until approved.';
comment on column public.insp_records.approved_at is
  'When the record was approved. Null for approvals predating migration 0034.';

create index if not exists insp_records_approved_at_idx
  on public.insp_records(approved_at);

-- Preserve the meaning of existing data: on approved rows, approver_id is the
-- approver, because that is what the old RPC wrote there.
update public.insp_records
   set approved_by = approver_id
 where approve_status = 'approved'
   and approved_by is null
   and approver_id is not null;

-- ---- approval RPC: record who and when, stop overwriting the routing target --
create or replace function public.insp_set_approval(
  p_ids uuid[], p_approve boolean, p_reason text default null
) returns int
  language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not public.has_insp_perm('insp_approve') then
    raise exception 'permission denied: insp_approve required';
  end if;

  update public.insp_records
     set approve_status = case when p_approve then 'approved'::public.insp_approve_status
                               else 'rejected'::public.insp_approve_status end,
         reject_reason  = case when p_approve then null else p_reason end,
         -- approver_id is deliberately NOT touched: it records who the record
         -- was sent to, which must survive the approval.
         approved_by    = case when p_approve then auth.uid() else null end,
         approved_at    = case when p_approve then now() else null end
   where id = any(p_ids);

  get diagnostics n = row_count;

  insert into public.insp_audit_log (action, record_ids, details)
  values (case when p_approve then 'approve' else 'reject' end, p_ids,
          jsonb_build_object('reason', p_reason));

  return n;
end $$;

revoke all on function public.insp_set_approval(uuid[], boolean, text) from public;
revoke execute on function public.insp_set_approval(uuid[], boolean, text) from anon;
grant execute on function public.insp_set_approval(uuid[], boolean, text) to authenticated;
