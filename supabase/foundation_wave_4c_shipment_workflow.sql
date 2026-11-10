-- TASK-2026-001 Wave 4c (AC-TASK-016, AC-TASK-017): Gate workflow of Shipment and Trip.
-- Shipment: preparation → factory_contact → pickup_waiting → loading → in_transit, only by the
-- assigned logistician, one step at a time, with required data and audit. Later stages and
-- problem transitions are not part of the Gate and are rejected.
-- Trip: created idempotently with parent, sequence, route, mode and assignee; advances
-- planned → loading → in_transit by its assignee only.
-- Depends on: foundation_wave_4b_trips_tracking.sql.

-- 1. Shipment stage -------------------------------------------------------------
alter table public.transports
  add column if not exists stage text not null default 'preparation'
    check (stage in ('preparation', 'factory_contact', 'pickup_waiting', 'loading', 'in_transit'));

create table if not exists public.shipment_stage_history (
  id           bigint generated always as identity primary key,
  transport_id uuid not null references public.transports (id) on delete restrict,
  workspace_id uuid not null references public.tenant_workspaces (id),
  from_stage   text not null,
  to_stage     text not null,
  note         text,
  actor_id     uuid references auth.users (id),
  created_at   timestamptz not null default now()
);
alter table public.shipment_stage_history enable row level security;
drop policy if exists shipment_stage_history_select on public.shipment_stage_history;
create policy shipment_stage_history_select on public.shipment_stage_history for select to authenticated
  using (public.can_read_transport(transport_id));
revoke all on public.shipment_stage_history from anon, authenticated;
grant select (id, transport_id, from_stage, to_stage, created_at) on public.shipment_stage_history to authenticated;

-- Legacy status/progress follow the Gate stage so every screen shows the same state.
create or replace function public.transports_stage_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if tg_op = 'UPDATE' and old.workspace_id is not null
     and (new.stage is distinct from old.stage or new.status is distinct from old.status
          or new.progress is distinct from old.progress)
     and coalesce(current_setting('exim.shipment_stage', true), '') <> 'on' then
    raise exception 'use advance_shipment to change the shipment stage' using errcode = '42501';
  end if;
  if new.workspace_id is null then
    return new;  -- legacy rows keep their own status until backfill
  end if;
  new.status := case new.stage
    when 'loading' then 'loading'
    when 'in_transit' then 'in_transit'
    else 'preparing' end;
  new.progress := case new.stage
    when 'preparation' then 5 when 'factory_contact' then 10 when 'pickup_waiting' then 15
    when 'loading' then 20 else 50 end;
  return new;
end
$function$;
drop trigger if exists transports_stage_guard on public.transports;
create trigger transports_stage_guard before insert or update on public.transports
  for each row execute function public.transports_stage_guard();

create or replace function public.advance_shipment(p_transport_id uuid, p_to_stage text, p_note text default null)
returns text
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_t public.transports%rowtype;
  v_order public.orders%rowtype;
  v_next text;
begin
  select * into v_t from public.transports where id = p_transport_id for update;
  if not found or v_t.workspace_id is null then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select * into v_order from public.orders where id = v_t.order_id;
  -- only the logistician assigned to this shipment
  if not (coalesce(v_t.logist_id, v_order.logist_id) = auth.uid()
          and public.has_workspace_role(v_t.workspace_id, array['logistician'])) then
    raise exception 'only the assigned logistician moves the shipment' using errcode = '42501';
  end if;
  v_next := case v_t.stage
    when 'preparation' then 'factory_contact'
    when 'factory_contact' then 'pickup_waiting'
    when 'pickup_waiting' then 'loading'
    when 'loading' then 'in_transit'
    else null end;
  if v_next is null or p_to_stage is distinct from v_next then
    raise exception 'transition % -> % is not allowed in the Gate', v_t.stage, coalesce(p_to_stage, 'null')
      using errcode = '22023';
  end if;
  -- required data per step
  if v_next = 'factory_contact' and length(btrim(coalesce(p_note, ''))) < 3 then
    raise exception 'record the factory contact result' using errcode = '23502';
  end if;
  if v_next = 'loading' and not exists (select 1 from public.trips r where r.transport_id = p_transport_id) then
    raise exception 'create at least one trip before loading' using errcode = '23502';
  end if;
  if v_next = 'in_transit' and not exists (
       select 1 from public.trips r where r.transport_id = p_transport_id and r.trip_stage = 'in_transit') then
    raise exception 'at least one trip must be in transit' using errcode = '23502';
  end if;
  insert into public.shipment_stage_history(transport_id, workspace_id, from_stage, to_stage, note, actor_id)
  values (p_transport_id, v_t.workspace_id, v_t.stage, v_next, nullif(btrim(p_note), ''), auth.uid());
  perform set_config('exim.shipment_stage', 'on', true);
  update public.transports set stage = v_next where id = p_transport_id;
  perform set_config('exim.shipment_stage', '', true);
  insert into public.tenant_audit_events(workspace_id, actor_user_id, action, object_type, object_id, before_state, after_state)
  values (v_t.workspace_id, auth.uid(), 'shipment.stage_changed', 'transport', p_transport_id::text,
          jsonb_build_object('stage', v_t.stage), jsonb_build_object('stage', v_next));
  return v_next;
end
$function$;

-- 2. Trips ------------------------------------------------------------------------
alter table public.trips
  add column if not exists sequence    int,
  add column if not exists route       text check (route is null or length(route) <= 500),
  add column if not exists assignee_id uuid references auth.users (id),
  add column if not exists trip_stage  text not null default 'planned'
    check (trip_stage in ('planned', 'loading', 'in_transit')),
  add column if not exists client_key  uuid;
create unique index if not exists trips_client_key_uidx on public.trips (transport_id, client_key) where client_key is not null;
create unique index if not exists trips_sequence_uidx on public.trips (transport_id, sequence) where sequence is not null;

-- Scoped trips are created only by create_trip and moved only by advance_trip.
create or replace function public.trips_write_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_scoped boolean;
begin
  select t.workspace_id is not null into v_scoped from public.transports t where t.id = new.transport_id;
  if coalesce(v_scoped, false) and coalesce(current_setting('exim.trip_write', true), '') <> 'on' then
    if tg_op = 'INSERT' then
      raise exception 'use create_trip' using errcode = '42501';
    end if;
    if new.trip_stage is distinct from old.trip_stage or new.sequence is distinct from old.sequence
       or new.assignee_id is distinct from old.assignee_id or new.transport_id is distinct from old.transport_id
       or new.client_key is distinct from old.client_key then
      raise exception 'use advance_trip' using errcode = '42501';
    end if;
  end if;
  return new;
end
$function$;
drop trigger if exists trips_write_guard on public.trips;
create trigger trips_write_guard before insert or update on public.trips
  for each row execute function public.trips_write_guard();

create or replace function public.create_trip(
  p_transport_id uuid, p_client_key uuid, p_mode text, p_route text default null,
  p_name text default null, p_carrier text default null, p_vehicle_no text default null,
  p_driver text default null, p_container_no text default null, p_assignee uuid default null)
returns table (trip_id uuid, sequence int, created boolean)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_t public.transports%rowtype;
  v_id uuid;
  v_seq int;
  v_assignee uuid;
begin
  select * into v_t from public.transports where id = p_transport_id for update;
  if not found or v_t.workspace_id is null or not public.can_manage_transport(p_transport_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_client_key is null then
    raise exception 'client key is required' using errcode = '23502';
  end if;
  select r.id, r.sequence into v_id, v_seq from public.trips r
   where r.transport_id = p_transport_id and r.client_key = p_client_key;
  if v_id is not null then
    return query select v_id, v_seq, false;
    return;
  end if;
  if p_mode is null or p_mode not in ('road','rail','sea','air','multimodal') then
    raise exception 'mode is required' using errcode = '23502';
  end if;
  if p_mode = 'road' and (length(btrim(coalesce(p_carrier, ''))) = 0 or length(btrim(coalesce(p_vehicle_no, ''))) = 0) then
    raise exception 'road trip requires carrier and vehicle' using errcode = '23502';
  end if;
  v_assignee := coalesce(p_assignee, auth.uid());
  if not public.has_workspace_role(v_t.workspace_id, array['logistician', 'manager', 'tenant_admin'])
     or not exists (select 1 from public.workspace_memberships m
                    where m.workspace_id = v_t.workspace_id and m.user_id = v_assignee
                      and m.role in ('logistician', 'manager') and m.status = 'active') then
    raise exception 'assignee must be staff of the workspace' using errcode = '22023';
  end if;
  select coalesce(max(r.sequence), 0) + 1 into v_seq from public.trips r where r.transport_id = p_transport_id;
  perform set_config('exim.trip_write', 'on', true);
  insert into public.trips(transport_id, name, driver, mode, carrier, vehicle_no, container_no,
                           sequence, route, assignee_id, client_key)
  values (p_transport_id, coalesce(nullif(btrim(p_name), ''), 'Рейс ' || v_seq), coalesce(p_driver, ''), p_mode,
          nullif(btrim(p_carrier), ''), nullif(btrim(p_vehicle_no), ''), nullif(btrim(p_container_no), ''),
          v_seq, coalesce(nullif(btrim(p_route), ''), v_t.origin || ' → ' || v_t.destination), v_assignee, p_client_key)
  returning id into v_id;
  perform set_config('exim.trip_write', '', true);
  insert into public.tenant_audit_events(workspace_id, actor_user_id, action, object_type, object_id, after_state)
  values (v_t.workspace_id, auth.uid(), 'trip.created', 'trip', v_id::text,
          jsonb_build_object('transport_id', p_transport_id, 'sequence', v_seq, 'assignee', v_assignee));
  return query select v_id, v_seq, true;
end
$function$;

create or replace function public.advance_trip(p_trip_id uuid, p_to_stage text)
returns text
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_r public.trips%rowtype;
  v_ws uuid;
  v_next text;
begin
  select * into v_r from public.trips where id = p_trip_id for update;
  select t.workspace_id into v_ws from public.transports t where t.id = v_r.transport_id;
  if v_r.id is null or v_ws is null or v_r.assignee_id is distinct from auth.uid()
     or not public.has_workspace_role(v_ws, array['logistician', 'manager']) then
    raise exception 'only the trip assignee moves the trip' using errcode = '42501';
  end if;
  v_next := case v_r.trip_stage when 'planned' then 'loading' when 'loading' then 'in_transit' else null end;
  if v_next is null or p_to_stage is distinct from v_next then
    raise exception 'trip transition % -> % is not allowed in the Gate', v_r.trip_stage, coalesce(p_to_stage, 'null')
      using errcode = '22023';
  end if;
  perform set_config('exim.trip_write', 'on', true);
  update public.trips set trip_stage = v_next where id = p_trip_id;
  perform set_config('exim.trip_write', '', true);
  insert into public.tenant_audit_events(workspace_id, actor_user_id, action, object_type, object_id, before_state, after_state)
  values (v_ws, auth.uid(), 'trip.stage_changed', 'trip', p_trip_id::text,
          jsonb_build_object('stage', v_r.trip_stage), jsonb_build_object('stage', v_next));
  return v_next;
end
$function$;

-- Client projection gains sequence, route and stage; still no carrier, vehicle or driver.
drop function if exists public.client_trips(uuid);
create or replace function public.client_trips(p_transport_id uuid)
returns table (id uuid, transport_id uuid, sequence int, route text, mode text, trip_stage text,
               planned_departure date, planned_arrival date, created_at timestamptz)
language sql
security definer
set search_path = ''
stable
as $function$
  select r.id, r.transport_id, r.sequence, r.route, r.mode, r.trip_stage, r.planned_departure, r.planned_arrival, r.created_at
  from public.trips r
  where r.transport_id = p_transport_id and public.can_read_transport(p_transport_id)
  order by r.sequence nulls last, r.created_at
$function$;

revoke all on function public.client_trips(uuid) from public, anon;
revoke all on function public.advance_shipment(uuid, text, text) from public, anon;
revoke all on function public.create_trip(uuid, uuid, text, text, text, text, text, text, text, uuid) from public, anon;
revoke all on function public.advance_trip(uuid, text) from public, anon;
grant execute on function public.client_trips(uuid) to authenticated;
grant execute on function public.advance_shipment(uuid, text, text) to authenticated;
grant execute on function public.create_trip(uuid, uuid, text, text, text, text, text, text, text, uuid) to authenticated;
grant execute on function public.advance_trip(uuid, text) to authenticated;
