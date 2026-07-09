-- ============================================================================
--  0018_tubular_movements.sql — Tubular module: auditable inventory movements.
--  --------------------------------------------------------------------------
--  Replaces the prototype's silent-quantity-overwrite "transfers" with an
--  immutable movement ledger + transactional RPCs:
--    transfer_tubular()  -> creates a PENDING movement and commits the source
--                           quantity to "To Other Rig" (can't over-commit);
--    complete_movement() -> in ONE transaction deducts the source, adds to the
--                           destination (creating the destination record if
--                           needed), updates the movement counters, writes a
--                           'movement' submission for BOTH units;
--    cancel_movement()   -> releases the pending commitment.
--  Business assumption (flagged in the plan's open questions): transfers move
--  PREMIUM (serviceable) stock — the workbook's To Other Rig / Receive From
--  Rig columns carry no classification, and unserviceable pipe is dispatched
--  through repair/scrap flows, not rig-to-rig transfer.
--  Record counters are ONLY ever changed inside these RPCs.
-- ============================================================================

do $$ begin
  create type public.movement_status as enum ('pending', 'completed', 'cancelled');
exception when duplicate_object then null;
end $$;

create table if not exists public.tubular_movements (
  id            uuid primary key default gen_random_uuid(),
  record_id     uuid not null references public.tubular_records(id) on delete restrict,
  from_unit_id  uuid not null references public.units(id),
  to_unit_id    uuid not null references public.units(id),
  quantity      int  not null check (quantity > 0),
  status        public.movement_status not null default 'pending',
  note          text,
  created_by    uuid not null references auth.users(id),
  created_at    timestamptz not null default clock_timestamp(),
  completed_by  uuid references auth.users(id),
  completed_at  timestamptz,
  cancelled_by  uuid references auth.users(id),
  cancelled_at  timestamptz,
  -- a completed/cancelled movement is immutable history
  constraint tubular_movements_units_differ check (from_unit_id <> to_unit_id)
);

create index if not exists tubular_movements_from_idx on public.tubular_movements (from_unit_id, status);
create index if not exists tubular_movements_to_idx   on public.tubular_movements (to_unit_id, status);

alter table public.tubular_movements enable row level security;

drop policy if exists tubular_movements_read on public.tubular_movements;
create policy tubular_movements_read on public.tubular_movements
  for select to authenticated
  using (public.has_tubular_perm('view_fleet')
         or (public.has_tubular_perm('view')
             and (from_unit_id in (select public.assigned_unit_ids())
                  or to_unit_id in (select public.assigned_unit_ids()))));
-- writes only via the RPCs below.

-- ---- helper: movement submission for a unit (audit both sides) ------------------
create or replace function public._tubular_movement_submission(
  p_unit uuid, p_note text, p_record_ids uuid[]
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_sub uuid;
begin
  insert into public.tubular_submissions (unit_id, submitted_by, source, note)
  values (p_unit, auth.uid(), 'movement', p_note)
  returning id into v_sub;
  insert into public.tubular_submission_lines (
    submission_id, record_id, on_contract, premium, class2, class3, scrap,
    needs_inspection, damaged_on_location, send_to_repair, to_other_rig,
    receive_from_rig, on_board_override, rental_date, remarks, archived)
  select v_sub, t.id, t.on_contract, t.premium, t.class2, t.class3, t.scrap,
         t.needs_inspection, t.damaged_on_location, t.send_to_repair,
         t.to_other_rig, t.receive_from_rig, t.on_board_override,
         t.rental_date, t.remarks, t.archived
  from public.tubular_records t where t.id = any(p_record_ids);
end;
$$;

revoke all on function public._tubular_movement_submission(uuid, text, uuid[]) from public;
revoke execute on function public._tubular_movement_submission(uuid, text, uuid[]) from anon;
-- internal helper: not granted to authenticated (callable only from the SECDEF
-- RPCs below, which run as the function owner).

-- ---- create a pending transfer ---------------------------------------------------
create or replace function public.transfer_tubular(
  p_record_id uuid,
  p_to_unit_id uuid,
  p_quantity int,
  p_note text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rec public.tubular_records%rowtype;
  v_pending int;
  v_movement uuid;
begin
  if not public.has_tubular_perm('data_entry') then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  select * into v_rec from public.tubular_records where id = p_record_id for update;
  if v_rec.id is null or v_rec.archived then
    raise exception 'unknown record' using errcode = '22023';
  end if;
  if v_rec.unit_id not in (select public.assigned_unit_ids()) then
    raise exception 'not authorized for the source unit' using errcode = '42501';
  end if;
  if p_to_unit_id is null or p_to_unit_id = v_rec.unit_id
     or not exists (select 1 from public.units where id = p_to_unit_id and active) then
    raise exception 'invalid destination unit' using errcode = '22023';
  end if;
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'quantity must be positive' using errcode = '22023';
  end if;

  -- cannot commit more than the record's serviceable premium stock, counting
  -- other still-pending outbound movements on the same record
  select coalesce(sum(quantity), 0) into v_pending
  from public.tubular_movements
  where record_id = p_record_id and status = 'pending';
  if p_quantity + v_pending > v_rec.premium then
    raise exception 'transfer exceeds premium stock (% available, % pending)',
      v_rec.premium, v_pending using errcode = '23514';
  end if;

  insert into public.tubular_movements (record_id, from_unit_id, to_unit_id, quantity, note, created_by)
  values (p_record_id, v_rec.unit_id, p_to_unit_id, p_quantity, p_note, auth.uid())
  returning id into v_movement;

  update public.tubular_records
    set to_other_rig = to_other_rig + p_quantity, updated_by = auth.uid()
  where id = p_record_id;

  perform public._tubular_movement_submission(
    v_rec.unit_id, 'transfer initiated → ' || (select name from public.units where id = p_to_unit_id),
    array[p_record_id]);

  return v_movement;
end;
$$;

revoke all on function public.transfer_tubular(uuid, uuid, int, text) from public;
revoke execute on function public.transfer_tubular(uuid, uuid, int, text) from anon;
grant execute on function public.transfer_tubular(uuid, uuid, int, text) to authenticated;

-- ---- complete (receive) ------------------------------------------------------------
create or replace function public.complete_movement(p_movement_id uuid) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_mv public.tubular_movements%rowtype;
  v_src public.tubular_records%rowtype;
  v_dest uuid;
begin
  select * into v_mv from public.tubular_movements where id = p_movement_id for update;
  if v_mv.id is null then
    raise exception 'unknown movement' using errcode = '22023';
  end if;
  if v_mv.status is distinct from 'pending' then
    raise exception 'movement is %', v_mv.status using errcode = '22023';
  end if;
  -- receiver confirms: approve_movements anywhere, or data_entry on the destination
  if not (public.has_tubular_perm('approve_movements')
          or (public.has_tubular_perm('data_entry')
              and v_mv.to_unit_id in (select public.assigned_unit_ids()))) then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  select * into v_src from public.tubular_records where id = v_mv.record_id for update;
  if v_src.premium < v_mv.quantity or v_src.to_other_rig < v_mv.quantity then
    raise exception 'source no longer has the committed stock (premium %, to_other_rig %)',
      v_src.premium, v_src.to_other_rig using errcode = '23514';
  end if;

  update public.tubular_records
    set premium = premium - v_mv.quantity,
        to_other_rig = to_other_rig - v_mv.quantity,
        updated_by = auth.uid()
  where id = v_src.id;

  -- destination record: first non-archived row of the same catalog item, else new
  select id into v_dest from public.tubular_records
  where unit_id = v_mv.to_unit_id and catalog_item_id = v_src.catalog_item_id and not archived
  order by position, created_at limit 1
  for update;

  if v_dest is null then
    insert into public.tubular_records (
      unit_id, catalog_item_id, position, premium, receive_from_rig,
      remarks, created_by, updated_by)
    values (
      v_mv.to_unit_id, v_src.catalog_item_id, coalesce(v_src.position, 0),
      v_mv.quantity, v_mv.quantity,
      'received from ' || (select name from public.units where id = v_mv.from_unit_id),
      auth.uid(), auth.uid())
    returning id into v_dest;
  else
    update public.tubular_records
      set premium = premium + v_mv.quantity,
          receive_from_rig = receive_from_rig + v_mv.quantity,
          updated_by = auth.uid()
    where id = v_dest;
  end if;

  update public.tubular_movements
    set status = 'completed', completed_by = auth.uid(), completed_at = clock_timestamp()
  where id = p_movement_id;

  perform public._tubular_movement_submission(
    v_mv.from_unit_id, 'transfer completed → ' || (select name from public.units where id = v_mv.to_unit_id),
    array[v_src.id]);
  perform public._tubular_movement_submission(
    v_mv.to_unit_id, 'transfer received ← ' || (select name from public.units where id = v_mv.from_unit_id),
    array[v_dest]);
end;
$$;

revoke all on function public.complete_movement(uuid) from public;
revoke execute on function public.complete_movement(uuid) from anon;
grant execute on function public.complete_movement(uuid) to authenticated;

-- ---- cancel ---------------------------------------------------------------------------
create or replace function public.cancel_movement(p_movement_id uuid) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_mv public.tubular_movements%rowtype;
begin
  select * into v_mv from public.tubular_movements where id = p_movement_id for update;
  if v_mv.id is null then
    raise exception 'unknown movement' using errcode = '22023';
  end if;
  if v_mv.status is distinct from 'pending' then
    raise exception 'movement is %', v_mv.status using errcode = '22023';
  end if;
  if not (public.has_tubular_perm('approve_movements')
          or v_mv.created_by = auth.uid()) then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  update public.tubular_records
    set to_other_rig = greatest(to_other_rig - v_mv.quantity, 0), updated_by = auth.uid()
  where id = v_mv.record_id;

  update public.tubular_movements
    set status = 'cancelled', cancelled_by = auth.uid(), cancelled_at = clock_timestamp()
  where id = p_movement_id;

  perform public._tubular_movement_submission(
    v_mv.from_unit_id, 'transfer cancelled', array[v_mv.record_id]);
end;
$$;

revoke all on function public.cancel_movement(uuid) from public;
revoke execute on function public.cancel_movement(uuid) from anon;
grant execute on function public.cancel_movement(uuid) to authenticated;
