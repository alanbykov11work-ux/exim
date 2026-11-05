-- TASK-2026-001 Wave 4b (REQ-002, REQ-006): mode-aware trips, versioned tracking events,
-- explicit publication of client versions. History is never deleted.
-- Depends on: foundation_wave_4a_agreement_shipment.sql.

-- 1. Trips: fields by transport mode and planned dates with change history.
alter table public.trips
  add column if not exists mode              text check (mode is null or mode in ('road','rail','sea','air','multimodal')),
  add column if not exists vehicle_no        text check (vehicle_no is null or length(vehicle_no) <= 50),
  add column if not exists trailer_no        text check (trailer_no is null or length(trailer_no) <= 50),
  add column if not exists container_no      text check (container_no is null or length(container_no) <= 50),
  add column if not exists wagon_no          text check (wagon_no is null or length(wagon_no) <= 50),
  add column if not exists flight_no         text check (flight_no is null or length(flight_no) <= 50),
  add column if not exists bill_no           text check (bill_no is null or length(bill_no) <= 80),
  add column if not exists carrier           text check (carrier is null or length(carrier) <= 200),
  add column if not exists planned_departure date,
  add column if not exists planned_arrival   date;

create table if not exists public.trip_plan_changes (
  id            bigint generated always as identity primary key,
  trip_id       uuid not null references public.trips (id) on delete restrict,
  field         text not null check (field in ('planned_departure', 'planned_arrival')),
  old_value     date,
  new_value     date,
  reason        text not null check (length(btrim(reason)) between 3 and 2000),
  changed_by    uuid references auth.users (id),
  created_at    timestamptz not null default now()
);
alter table public.trip_plan_changes enable row level security;
drop policy if exists trip_plan_changes_staff on public.trip_plan_changes;
create policy trip_plan_changes_staff on public.trip_plan_changes for select to authenticated
  using (exists (select 1 from public.trips t where t.id = trip_id and public.can_manage_transport(t.transport_id)));
revoke all on public.trip_plan_changes from anon, authenticated;
grant select on public.trip_plan_changes to authenticated;

-- Planned dates change only with a reason (once set).
create or replace function public.trips_plan_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if coalesce(current_setting('exim.trip_plan', true), '') <> 'on'
     and ((old.planned_departure is not null and new.planned_departure is distinct from old.planned_departure)
       or (old.planned_arrival is not null and new.planned_arrival is distinct from old.planned_arrival)) then
    raise exception 'use set_trip_plan to change planned dates' using errcode = '42501';
  end if;
  return new;
end
$function$;
drop trigger if exists trips_plan_guard on public.trips;
create trigger trips_plan_guard before update on public.trips
  for each row execute function public.trips_plan_guard();

create or replace function public.set_trip_plan(p_trip_id uuid, p_departure date, p_arrival date, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_trip public.trips%rowtype;
begin
  select * into v_trip from public.trips where id = p_trip_id for update;
  if not found or not public.can_manage_transport(v_trip.transport_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_departure is not null and p_arrival is not null and p_arrival < p_departure then
    raise exception 'arrival before departure' using errcode = '22023';
  end if;
  if (v_trip.planned_departure is not null and p_departure is distinct from v_trip.planned_departure)
     or (v_trip.planned_arrival is not null and p_arrival is distinct from v_trip.planned_arrival) then
    if length(btrim(coalesce(p_reason, ''))) < 3 then
      raise exception 'changing a planned date requires a reason' using errcode = '23502';
    end if;
  end if;
  if p_departure is distinct from v_trip.planned_departure and v_trip.planned_departure is not null then
    insert into public.trip_plan_changes(trip_id, field, old_value, new_value, reason, changed_by)
    values (p_trip_id, 'planned_departure', v_trip.planned_departure, p_departure, p_reason, auth.uid());
  end if;
  if p_arrival is distinct from v_trip.planned_arrival and v_trip.planned_arrival is not null then
    insert into public.trip_plan_changes(trip_id, field, old_value, new_value, reason, changed_by)
    values (p_trip_id, 'planned_arrival', v_trip.planned_arrival, p_arrival, p_reason, auth.uid());
  end if;
  perform set_config('exim.trip_plan', 'on', true);
  update public.trips set planned_departure = p_departure, planned_arrival = p_arrival where id = p_trip_id;
  perform set_config('exim.trip_plan', '', true);
end
$function$;

-- Client projection of trips: status, mode and planned dates; never driver, vehicle or carrier.
drop function if exists public.client_trips(uuid);
create or replace function public.client_trips(p_transport_id uuid)
returns table (id uuid, transport_id uuid, status text, mode text,
               planned_departure date, planned_arrival date, created_at timestamptz)
language sql
security definer
set search_path = ''
stable
as $function$
  select trip.id, trip.transport_id, trip.status, trip.mode, trip.planned_departure, trip.planned_arrival, trip.created_at
  from public.trips trip
  where trip.transport_id = p_transport_id
    and public.can_read_transport(p_transport_id)
  order by trip.created_at
$function$;
revoke all on function public.client_trips(uuid) from public, anon;
grant execute on function public.client_trips(uuid) to authenticated;

-- 2. Internal events: type, time, place, source; corrections are new versions.
alter table public.trip_events
  add column if not exists event_type    text check (event_type is null or event_type in
    ('loaded','departed','border','customs_in','customs_out','arrived','delivered','delay','other')),
  add column if not exists occurred_at   timestamptz,
  add column if not exists location      text check (location is null or length(location) <= 300),
  add column if not exists source        text not null default 'manual' check (source in ('manual')),
  add column if not exists client_draft  text check (client_draft is null or length(client_draft) <= 2000),
  add column if not exists supersedes_id bigint references public.trip_events (id),
  add column if not exists is_current    boolean not null default true;

create or replace function public.trip_events_insert_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if new.trip_id is not null and not exists (
       select 1 from public.trips t where t.id = new.trip_id and t.transport_id = new.transport_id) then
    raise exception 'trip does not belong to this transport' using errcode = '22023';
  end if;
  if coalesce(current_setting('exim.event_correction', true), '') <> 'on' then
    new.supersedes_id := null;
    new.is_current := true;
  end if;
  new.occurred_at := coalesce(new.occurred_at, now());
  new.created_at := now();
  return new;
end
$function$;
drop trigger if exists trip_events_insert_guard on public.trip_events;
create trigger trip_events_insert_guard before insert on public.trip_events
  for each row execute function public.trip_events_insert_guard();

-- Events are never edited in place: only the "processed" flag can change.
drop policy if exists "trip events staff update" on public.trip_events;
create policy "trip events staff update" on public.trip_events for update
  using (public.can_manage_transport(transport_id)) with check (public.can_manage_transport(transport_id));
revoke update on public.trip_events from authenticated;
grant update (processed) on public.trip_events to authenticated;

create or replace function public.correct_trip_event(
  p_event_id bigint, p_internal_text text, p_occurred_at timestamptz, p_location text,
  p_event_type text, p_client_draft text default null)
returns bigint
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_old public.trip_events%rowtype;
  v_id bigint;
begin
  select * into v_old from public.trip_events where id = p_event_id for update;
  if not found or not public.can_manage_transport(v_old.transport_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if not v_old.is_current then
    raise exception 'only the current version can be corrected' using errcode = '22023';
  end if;
  update public.trip_events set is_current = false where id = p_event_id;
  perform set_config('exim.event_correction', 'on', true);
  insert into public.trip_events(transport_id, trip_id, internal_text, created_by, event_type, occurred_at,
                                 location, client_draft, supersedes_id, is_current)
  values (v_old.transport_id, v_old.trip_id, p_internal_text, auth.uid(), p_event_type, p_occurred_at,
          p_location, p_client_draft, p_event_id, true)
  returning id into v_id;
  perform set_config('exim.event_correction', '', true);
  return v_id;
end
$function$;

-- 3. Client feed: published only by a manager through publish_event; versions and hiding keep history.
alter table public.transport_updates
  add column if not exists occurred_at   timestamptz,
  add column if not exists location      text,
  add column if not exists version       int not null default 1,
  add column if not exists superseded_by bigint references public.transport_updates (id),
  add column if not exists hidden        boolean not null default false,
  add column if not exists hidden_reason text,
  add column if not exists hidden_by     uuid references auth.users (id),
  add column if not exists hidden_at     timestamptz;

drop policy if exists "transport updates scoped read" on public.transport_updates;
drop policy if exists "transport updates manager insert" on public.transport_updates;
create policy "transport updates scoped read" on public.transport_updates for select using (
  public.can_manage_transport(transport_id)
  or (public.can_read_transport(transport_id) and not hidden and superseded_by is null)
);
revoke all on public.transport_updates from authenticated;
-- clients get only the client-safe columns
grant select (id, transport_id, public_text, occurred_at, location, version, created_at)
  on public.transport_updates to authenticated;

create or replace function public.can_publish_transport(p_transport_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (select 1 from public.transports t where t.id = p_transport_id
                 and public.has_workspace_role(t.workspace_id, array['manager', 'tenant_admin']))
$function$;

-- Publishes (or re-publishes as a new version) the client text of an event.
create or replace function public.publish_event(p_event_id bigint, p_public_text text)
returns bigint
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_ev public.trip_events%rowtype;
  v_prev public.transport_updates%rowtype;
  v_id bigint;
  v_chain bigint[];
begin
  select * into v_ev from public.trip_events where id = p_event_id;
  if not found or not public.can_publish_transport(v_ev.transport_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if not v_ev.is_current then
    raise exception 'publish the current version of the event' using errcode = '22023';
  end if;
  if length(btrim(coalesce(p_public_text, ''))) < 3 then
    raise exception 'client text is required' using errcode = '23502';
  end if;
  -- the publication of any earlier version of the same event is replaced, not deleted
  with recursive chain(id, supersedes_id) as (
    select e.id, e.supersedes_id from public.trip_events e where e.id = p_event_id
    union all
    select e.id, e.supersedes_id from public.trip_events e join chain c on e.id = c.supersedes_id
  ) select array_agg(id) into v_chain from chain;
  select * into v_prev from public.transport_updates u
   where u.source_event = any (v_chain) and u.superseded_by is null
   order by u.version desc limit 1 for update;
  if found and v_prev.source_event = p_event_id and v_prev.public_text = btrim(p_public_text) and not v_prev.hidden then
    return v_prev.id;  -- same publication repeated
  end if;
  insert into public.transport_updates(transport_id, source_event, public_text, published_by, occurred_at, location, version)
  values (v_ev.transport_id, p_event_id, btrim(p_public_text), auth.uid(), v_ev.occurred_at, v_ev.location,
          coalesce(v_prev.version, 0) + 1)
  returning id into v_id;
  if v_prev.id is not null then
    update public.transport_updates set superseded_by = v_id where id = v_prev.id;
  end if;
  update public.trip_events set processed = true where id = p_event_id;
  return v_id;
end
$function$;

create or replace function public.hide_update(p_update_id bigint, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_tr uuid;
begin
  select transport_id into v_tr from public.transport_updates where id = p_update_id;
  if v_tr is null or not public.can_publish_transport(v_tr) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if length(btrim(coalesce(p_reason, ''))) < 3 then
    raise exception 'reason is required' using errcode = '23502';
  end if;
  update public.transport_updates set hidden = true, hidden_reason = p_reason, hidden_by = auth.uid(), hidden_at = now()
   where id = p_update_id;
end
$function$;

-- Staff view of the whole feed, including hidden and replaced versions.
create or replace function public.transport_feed_staff(p_transport_id uuid)
returns table (id bigint, source_event bigint, public_text text, occurred_at timestamptz, location text,
               version int, superseded_by bigint, hidden boolean, hidden_reason text,
               published_by uuid, created_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $function$
  select u.id, u.source_event, u.public_text, u.occurred_at, u.location, u.version, u.superseded_by,
         u.hidden, u.hidden_reason, u.published_by, u.created_at
  from public.transport_updates u
  where u.transport_id = p_transport_id and public.can_manage_transport(p_transport_id)
  order by coalesce(u.occurred_at, u.created_at), u.id
$function$;

revoke all on function public.set_trip_plan(uuid, date, date, text) from public, anon;
revoke all on function public.correct_trip_event(bigint, text, timestamptz, text, text, text) from public, anon;
revoke all on function public.publish_event(bigint, text) from public, anon;
revoke all on function public.hide_update(bigint, text) from public, anon;
revoke all on function public.transport_feed_staff(uuid) from public, anon;
revoke all on function public.can_publish_transport(uuid) from public, anon;
grant execute on function public.set_trip_plan(uuid, date, date, text) to authenticated;
grant execute on function public.correct_trip_event(bigint, text, timestamptz, text, text, text) to authenticated;
grant execute on function public.publish_event(bigint, text) to authenticated;
grant execute on function public.hide_update(bigint, text) to authenticated;
grant execute on function public.transport_feed_staff(uuid) to authenticated;
grant execute on function public.can_publish_transport(uuid) to authenticated;
