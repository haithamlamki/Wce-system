-- ============================================================================
--  0020_tubular_orders.sql — Tubular module: pipe order & delivery workflow.
--  --------------------------------------------------------------------------
--  Replaces the prototype's random 15-45s auto-advancing demo timers with a
--  real staged workflow driven entirely by explicit, authorized RPC calls:
--     requested → approved → picked → in_transit → delivered
--                    ↘ cancelled (any pre-delivery stage; releases holds)
--  Rules (approved decisions):
--    - available stock = Premium + Class 2 − held reservations. Class 3,
--      Scrap and Needs Inspection are NEVER orderable (user decision
--      2026-07-09) — enforced by the availability view + approval check.
--    - approval creates 'held' reservations against concrete source records;
--      reservations never mutate record counters.
--    - delivery consumes the reservations and creates COMPLETED movements
--      (source premium → destination premium) in one transaction — the
--      destination is only ever updated through this delivery event.
--    - cancellation/rejection releases all holds.
--    - every stage transition is an append-only pipe_order_events row with
--      actor + timestamp + note.
-- ============================================================================

do $$ begin
  create type public.pipe_order_status as enum
    ('requested', 'approved', 'picked', 'in_transit', 'delivered', 'cancelled');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.reservation_status as enum ('held', 'released', 'consumed');
exception when duplicate_object then null;
end $$;

create sequence if not exists public.pipe_order_seq;

create table if not exists public.pipe_orders (
  id                 uuid primary key default gen_random_uuid(),
  order_no           text not null unique
    default ('PO-' || to_char(nextval('public.pipe_order_seq'), 'FM00000')),
  requesting_unit_id uuid not null references public.units(id),
  requested_by       uuid not null references auth.users(id),
  status             public.pipe_order_status not null default 'requested',
  priority           text not null default 'normal' check (priority in ('low', 'normal', 'high', 'urgent')),
  needed_by          date,
  notes              text,
  created_at         timestamptz not null default clock_timestamp(),
  approved_by        uuid references auth.users(id),
  approved_at        timestamptz
);

create index if not exists pipe_orders_unit_idx on public.pipe_orders (requesting_unit_id, status);

create table if not exists public.pipe_order_items (
  id              uuid primary key default gen_random_uuid(),
  order_id        uuid not null references public.pipe_orders(id) on delete cascade,
  catalog_item_id uuid not null references public.tubular_catalog(id),
  quantity        int not null check (quantity > 0)
);

create table if not exists public.pipe_order_events (
  id          uuid primary key default gen_random_uuid(),
  order_id    uuid not null references public.pipe_orders(id) on delete cascade,
  from_status public.pipe_order_status,
  to_status   public.pipe_order_status not null,
  actor       uuid not null references auth.users(id),
  occurred_at timestamptz not null default clock_timestamp(),
  note        text
);

create table if not exists public.tubular_reservations (
  id            uuid primary key default gen_random_uuid(),
  order_item_id uuid not null references public.pipe_order_items(id) on delete cascade,
  record_id     uuid not null references public.tubular_records(id),
  quantity      int not null check (quantity > 0),
  status        public.reservation_status not null default 'held',
  created_at    timestamptz not null default clock_timestamp(),
  released_at   timestamptz
);

create index if not exists tubular_reservations_record_idx
  on public.tubular_reservations (record_id, status);

-- available = serviceable (P+C2) minus held reservations, per record
create or replace view public.tubular_availability
with (security_invoker = true) as
select t.id as record_id, t.unit_id, t.catalog_item_id,
       t.premium + t.class2 as serviceable,
       coalesce(h.held, 0) as held,
       t.premium + t.class2 - coalesce(h.held, 0) as available
from public.tubular_records t
left join (
  select record_id, sum(quantity) as held
  from public.tubular_reservations
  where status = 'held'
  group by record_id
) h on h.record_id = t.id
where not t.archived;

alter table public.pipe_orders enable row level security;
alter table public.pipe_order_items enable row level security;
alter table public.pipe_order_events enable row level security;
alter table public.tubular_reservations enable row level security;

-- orders are visible to fleet viewers, order managers/approvers, the
-- requesting unit's viewers, and the requester
drop policy if exists pipe_orders_read on public.pipe_orders;
create policy pipe_orders_read on public.pipe_orders
  for select to authenticated
  using (public.has_tubular_perm('view_fleet')
         or public.has_tubular_perm('manage_orders')
         or public.has_tubular_perm('approve_orders')
         or requested_by = auth.uid()
         or (public.has_tubular_perm('view')
             and requesting_unit_id in (select public.assigned_unit_ids())));

drop policy if exists pipe_order_items_read on public.pipe_order_items;
create policy pipe_order_items_read on public.pipe_order_items
  for select to authenticated
  using (exists (select 1 from public.pipe_orders o where o.id = order_id));

drop policy if exists pipe_order_events_read on public.pipe_order_events;
create policy pipe_order_events_read on public.pipe_order_events
  for select to authenticated
  using (exists (select 1 from public.pipe_orders o where o.id = order_id));

drop policy if exists tubular_reservations_read on public.tubular_reservations;
create policy tubular_reservations_read on public.tubular_reservations
  for select to authenticated
  using (public.has_tubular_perm('view_fleet')
         or public.has_tubular_perm('manage_orders')
         or public.has_tubular_perm('approve_orders'));
-- all writes via RPCs below.

-- ---- create ------------------------------------------------------------------------
-- p_items: [{catalog_item_id, quantity}]
create or replace function public.create_pipe_order(
  p_unit_id uuid, p_items jsonb, p_needed_by date default null,
  p_priority text default 'normal', p_note text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_order uuid; v_n int;
begin
  if not (public.has_tubular_perm('data_entry') or public.has_tubular_perm('manage_orders')) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if p_unit_id is null or p_unit_id not in (select public.assigned_unit_ids()) then
    raise exception 'not authorized for this unit' using errcode = '42501';
  end if;
  if p_items is null or jsonb_typeof(p_items) is distinct from 'array'
     or jsonb_array_length(p_items) = 0 then
    raise exception 'order needs at least one item' using errcode = '22023';
  end if;

  insert into public.pipe_orders (requesting_unit_id, requested_by, needed_by, priority, notes)
  values (p_unit_id, auth.uid(), p_needed_by, coalesce(p_priority, 'normal'), p_note)
  returning id into v_order;

  insert into public.pipe_order_items (order_id, catalog_item_id, quantity)
  select v_order, x.catalog_item_id, x.quantity
  from jsonb_to_recordset(p_items) as x(catalog_item_id uuid, quantity int);

  get diagnostics v_n = row_count;
  if v_n = 0 then
    raise exception 'order needs at least one item' using errcode = '22023';
  end if;

  insert into public.pipe_order_events (order_id, from_status, to_status, actor, note)
  values (v_order, null, 'requested', auth.uid(), p_note);

  return v_order;
end;
$$;

revoke all on function public.create_pipe_order(uuid, jsonb, date, text, text) from public;
revoke execute on function public.create_pipe_order(uuid, jsonb, date, text, text) from anon;
grant execute on function public.create_pipe_order(uuid, jsonb, date, text, text) to authenticated;

-- ---- approve (reserves stock) ----------------------------------------------------------
-- p_allocations: [{order_item_id, record_id, quantity}] — the approver picks
-- concrete source records. Every item must be fully allocated.
create or replace function public.approve_pipe_order(p_order_id uuid, p_allocations jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.pipe_orders%rowtype;
  a record;
  v_avail int;
  v_short record;
begin
  if not public.has_tubular_perm('approve_orders') then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  select * into v_order from public.pipe_orders where id = p_order_id for update;
  if v_order.id is null then raise exception 'unknown order' using errcode = '22023'; end if;
  if v_order.status is distinct from 'requested' then
    raise exception 'order is %', v_order.status using errcode = '22023';
  end if;
  if p_allocations is null or jsonb_typeof(p_allocations) is distinct from 'array' then
    raise exception 'p_allocations must be a json array' using errcode = '22023';
  end if;

  for a in
    select * from jsonb_to_recordset(p_allocations)
      as x(order_item_id uuid, record_id uuid, quantity int)
  loop
    if a.quantity is null or a.quantity <= 0 then
      raise exception 'allocation quantity must be positive' using errcode = '22023';
    end if;
    if not exists (select 1 from public.pipe_order_items i
                   where i.id = a.order_item_id and i.order_id = p_order_id) then
      raise exception 'allocation does not belong to this order' using errcode = '22023';
    end if;
    -- catalog item of the source record must match the ordered item
    if not exists (
      select 1 from public.pipe_order_items i
      join public.tubular_records t on t.id = a.record_id
      where i.id = a.order_item_id and t.catalog_item_id = i.catalog_item_id
        and t.unit_id <> v_order.requesting_unit_id and not t.archived) then
      raise exception 'source record does not match the ordered item (or is the requesting unit itself)'
        using errcode = '22023';
    end if;
    -- availability = P+C2 − held (Class 3 / Scrap / Needs Insp NEVER count)
    select available into v_avail from public.tubular_availability where record_id = a.record_id;
    if coalesce(v_avail, 0) < a.quantity then
      raise exception 'insufficient available stock on source record (% available, % requested)',
        coalesce(v_avail, 0), a.quantity using errcode = '23514';
    end if;

    insert into public.tubular_reservations (order_item_id, record_id, quantity)
    values (a.order_item_id, a.record_id, a.quantity);
  end loop;

  -- every ordered item fully allocated?
  select i.id, i.quantity, coalesce(sum(r.quantity), 0) as allocated into v_short
  from public.pipe_order_items i
  left join public.tubular_reservations r on r.order_item_id = i.id and r.status = 'held'
  where i.order_id = p_order_id
  group by i.id, i.quantity
  having coalesce(sum(r.quantity), 0) <> i.quantity
  limit 1;
  if v_short.id is not null then
    raise exception 'item % allocated %/% — every item must be fully allocated',
      v_short.id, v_short.allocated, v_short.quantity using errcode = '22023';
  end if;

  update public.pipe_orders
    set status = 'approved', approved_by = auth.uid(), approved_at = clock_timestamp()
  where id = p_order_id;
  insert into public.pipe_order_events (order_id, from_status, to_status, actor)
  values (p_order_id, 'requested', 'approved', auth.uid());
end;
$$;

revoke all on function public.approve_pipe_order(uuid, jsonb) from public;
revoke execute on function public.approve_pipe_order(uuid, jsonb) from anon;
grant execute on function public.approve_pipe_order(uuid, jsonb) to authenticated;

-- ---- advance (picked → in_transit → delivered) ------------------------------------------
create or replace function public.advance_pipe_order(
  p_order_id uuid, p_to public.pipe_order_status, p_note text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.pipe_orders%rowtype;
  v_legal boolean;
  r record;
  v_dest uuid;
begin
  select * into v_order from public.pipe_orders where id = p_order_id for update;
  if v_order.id is null then raise exception 'unknown order' using errcode = '22023'; end if;

  v_legal := (v_order.status, p_to) in
    (('approved', 'picked'), ('picked', 'in_transit'), ('in_transit', 'delivered'));
  if not v_legal then
    raise exception 'illegal transition % -> %', v_order.status, p_to using errcode = '22023';
  end if;

  if p_to in ('picked', 'in_transit') then
    if not public.has_tubular_perm('manage_orders') then
      raise exception 'not authorized' using errcode = '42501';
    end if;
  else -- delivered: receiving unit's data_entry, or manage_orders
    if not (public.has_tubular_perm('manage_orders')
            or (public.has_tubular_perm('data_entry')
                and v_order.requesting_unit_id in (select public.assigned_unit_ids()))) then
      raise exception 'not authorized' using errcode = '42501';
    end if;
  end if;

  if p_to = 'delivered' then
    -- consume every held reservation: move premium source → destination
    for r in
      select res.id as res_id, res.record_id, res.quantity,
             t.unit_id as from_unit_id, t.catalog_item_id, t.position
      from public.tubular_reservations res
      join public.pipe_order_items i on i.id = res.order_item_id
      join public.tubular_records t on t.id = res.record_id
      where i.order_id = p_order_id and res.status = 'held'
      order by res.created_at
    loop
      update public.tubular_records
        set premium = premium - r.quantity, updated_by = auth.uid()
      where id = r.record_id and premium >= r.quantity;
      if not found then
        raise exception 'source record % no longer has the reserved stock', r.record_id
          using errcode = '23514';
      end if;

      select id into v_dest from public.tubular_records
      where unit_id = v_order.requesting_unit_id
        and catalog_item_id = r.catalog_item_id and not archived
      order by position, created_at limit 1
      for update;
      if v_dest is null then
        insert into public.tubular_records (
          unit_id, catalog_item_id, position, premium, receive_from_rig,
          remarks, created_by, updated_by)
        values (v_order.requesting_unit_id, r.catalog_item_id, coalesce(r.position, 0),
                r.quantity, r.quantity, 'received via ' || v_order.order_no,
                auth.uid(), auth.uid())
        returning id into v_dest;
      else
        update public.tubular_records
          set premium = premium + r.quantity,
              receive_from_rig = receive_from_rig + r.quantity,
              updated_by = auth.uid()
        where id = v_dest;
      end if;

      insert into public.tubular_movements (
        record_id, from_unit_id, to_unit_id, quantity, status, note,
        created_by, completed_by, completed_at)
      values (r.record_id, r.from_unit_id, v_order.requesting_unit_id, r.quantity,
              'completed', 'pipe order ' || v_order.order_no,
              auth.uid(), auth.uid(), clock_timestamp());

      update public.tubular_reservations set status = 'consumed' where id = r.res_id;

      perform public._tubular_movement_submission(
        r.from_unit_id, 'dispatched via ' || v_order.order_no, array[r.record_id]);
      perform public._tubular_movement_submission(
        v_order.requesting_unit_id, 'delivered via ' || v_order.order_no, array[v_dest]);
    end loop;
  end if;

  update public.pipe_orders set status = p_to where id = p_order_id;
  insert into public.pipe_order_events (order_id, from_status, to_status, actor, note)
  values (p_order_id, v_order.status, p_to, auth.uid(), p_note);
end;
$$;

revoke all on function public.advance_pipe_order(uuid, public.pipe_order_status, text) from public;
revoke execute on function public.advance_pipe_order(uuid, public.pipe_order_status, text) from anon;
grant execute on function public.advance_pipe_order(uuid, public.pipe_order_status, text) to authenticated;

-- ---- cancel / reject -----------------------------------------------------------------------
create or replace function public.cancel_pipe_order(p_order_id uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_order public.pipe_orders%rowtype;
begin
  select * into v_order from public.pipe_orders where id = p_order_id for update;
  if v_order.id is null then raise exception 'unknown order' using errcode = '22023'; end if;
  if v_order.status in ('delivered', 'cancelled') then
    raise exception 'order is %', v_order.status using errcode = '22023';
  end if;
  if not (public.has_tubular_perm('approve_orders')
          or public.has_tubular_perm('manage_orders')
          or (v_order.status = 'requested' and v_order.requested_by = auth.uid())) then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  update public.tubular_reservations res
    set status = 'released', released_at = clock_timestamp()
  from public.pipe_order_items i
  where res.order_item_id = i.id and i.order_id = p_order_id and res.status = 'held';

  update public.pipe_orders set status = 'cancelled' where id = p_order_id;
  insert into public.pipe_order_events (order_id, from_status, to_status, actor, note)
  values (p_order_id, v_order.status, 'cancelled', auth.uid(), p_reason);
end;
$$;

revoke all on function public.cancel_pipe_order(uuid, text) from public;
revoke execute on function public.cancel_pipe_order(uuid, text) from anon;
grant execute on function public.cancel_pipe_order(uuid, text) to authenticated;
