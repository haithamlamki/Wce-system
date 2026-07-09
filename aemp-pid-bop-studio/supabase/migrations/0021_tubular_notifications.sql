-- ============================================================================
--  0021_tubular_notifications.sql — Tubular module: in-app notifications.
--  --------------------------------------------------------------------------
--  One notifications table + AFTER-INSERT triggers on the append-only event
--  streams (pipe_order_events, tubular_movements) so the transactional RPCs
--  need no changes and every notification is born in the same transaction as
--  the event it reports. Realtime delivery uses Supabase Realtime on the
--  table (wss already allowed by the CSP).
--    - new order requested  -> users holding approve_orders (explicit grants;
--      admins/managers hold it implicitly and are included via profiles)
--    - order stage change   -> the requester (unless they did it themselves)
--    - transfer created     -> data_entry users assigned to the destination
--  Users read/mark-read ONLY their own rows (RLS); inserts happen only via
--  the SECURITY DEFINER trigger paths.
-- ============================================================================

create table if not exists public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  kind       text not null,
  title      text not null,
  body       text,
  link       text,
  read_at    timestamptz,
  created_at timestamptz not null default clock_timestamp()
);

create index if not exists notifications_user_idx
  on public.notifications (user_id, read_at, created_at desc);

alter table public.notifications enable row level security;

drop policy if exists notifications_read on public.notifications;
create policy notifications_read on public.notifications
  for select to authenticated using (user_id = auth.uid());

-- the only client write is marking read
drop policy if exists notifications_mark_read on public.notifications;
create policy notifications_mark_read on public.notifications
  for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- helper: everyone who effectively holds a tubular permission
create or replace function public._tubular_perm_holders(p text) returns setof uuid
  language sql security definer stable set search_path = public as
$$
  select user_id from public.user_module_permissions where permission = p
  union
  select id from public.profiles where role in ('admin', 'manager')
$$;
revoke all on function public._tubular_perm_holders(text) from public;
revoke execute on function public._tubular_perm_holders(text) from anon;

-- ---- order events → notifications --------------------------------------------------
create or replace function public.notify_pipe_order_event() returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.pipe_orders%rowtype;
  v_unit text;
begin
  select * into v_order from public.pipe_orders where id = new.order_id;
  select name into v_unit from public.units where id = v_order.requesting_unit_id;

  if new.to_status = 'requested' then
    insert into public.notifications (user_id, kind, title, body, link)
    select h, 'order_requested',
           v_order.order_no || ' awaiting approval',
           v_unit || ' requested pipe (' || coalesce(v_order.priority, 'normal') || ' priority)',
           '/tubular/orders'
    from public._tubular_perm_holders('approve_orders') h
    where h is distinct from new.actor;
  else
    if v_order.requested_by is distinct from new.actor then
      insert into public.notifications (user_id, kind, title, body, link)
      values (v_order.requested_by, 'order_' || new.to_status,
              v_order.order_no || ' ' || replace(new.to_status::text, '_', ' '),
              coalesce(new.note, ''), '/tubular/orders');
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists notify_pipe_order_event on public.pipe_order_events;
create trigger notify_pipe_order_event
  after insert on public.pipe_order_events
  for each row execute function public.notify_pipe_order_event();

-- ---- movements → notify the receiving unit ------------------------------------------
create or replace function public.notify_movement() returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare v_from text; v_to text;
begin
  if new.status <> 'pending' then return new; end if; -- deliveries already notify via order events
  select name into v_from from public.units where id = new.from_unit_id;
  select name into v_to   from public.units where id = new.to_unit_id;
  insert into public.notifications (user_id, kind, title, body, link)
  select a.user_id, 'transfer_incoming',
         'Incoming transfer from ' || v_from,
         new.quantity || ' jt → ' || v_to || ' — confirm receipt when it arrives',
         '/tubular/transfers'
  from public.user_unit_assignments a
  join public.user_module_permissions p
    on p.user_id = a.user_id and p.permission = 'data_entry'
  where a.unit_id = new.to_unit_id and a.user_id is distinct from new.created_by;
  return new;
end;
$$;

drop trigger if exists notify_movement on public.tubular_movements;
create trigger notify_movement
  after insert on public.tubular_movements
  for each row execute function public.notify_movement();
