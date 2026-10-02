-- TASK-2026-001 / Foundation Gate / Wave 1b
-- Tenant and client-company scope for the legacy Private OS objects:
-- orders, order_finance, order_history, transports, trips, trip_events,
-- transport_updates.
--
-- Requires: workflow.sql, foundation_wave_1.sql.
--
-- Fail-closed by design: a legacy row without workspace_id is invisible to
-- every API role until an owner assigns its scope explicitly with
-- legacy_assign_order_scope(). Nothing is inferred from emails or names,
-- and no business row is deleted or rewritten.

begin;

-- ---------------------------------------------------------------------------
-- 1. Scope columns
-- ---------------------------------------------------------------------------
alter table public.orders
  add column if not exists workspace_id uuid references public.tenant_workspaces(id) on delete restrict,
  add column if not exists client_company_id uuid;

alter table public.transports
  add column if not exists workspace_id uuid references public.tenant_workspaces(id) on delete restrict,
  add column if not exists client_company_id uuid;

alter table public.order_finance
  add column if not exists workspace_id uuid references public.tenant_workspaces(id) on delete restrict;
alter table public.order_history
  add column if not exists workspace_id uuid references public.tenant_workspaces(id) on delete restrict;
alter table public.trips
  add column if not exists workspace_id uuid references public.tenant_workspaces(id) on delete restrict;
alter table public.trip_events
  add column if not exists workspace_id uuid references public.tenant_workspaces(id) on delete restrict;
alter table public.transport_updates
  add column if not exists workspace_id uuid references public.tenant_workspaces(id) on delete restrict;

do $constraints$
begin
  if not exists (select 1 from pg_constraint where conname = 'orders_company_workspace_fk') then
    alter table public.orders
      add constraint orders_company_workspace_fk
      foreign key (client_company_id, workspace_id)
      references public.client_companies(id, workspace_id) on delete restrict;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'orders_scope_complete') then
    alter table public.orders
      add constraint orders_scope_complete check (
        (workspace_id is null and client_company_id is null)
        or (workspace_id is not null and client_company_id is not null)
      );
  end if;
  if not exists (select 1 from pg_constraint where conname = 'transports_company_workspace_fk') then
    alter table public.transports
      add constraint transports_company_workspace_fk
      foreign key (client_company_id, workspace_id)
      references public.client_companies(id, workspace_id) on delete restrict;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'transports_scope_complete') then
    alter table public.transports
      add constraint transports_scope_complete check (
        (workspace_id is null and client_company_id is null)
        or (workspace_id is not null and client_company_id is not null)
      );
  end if;
end
$constraints$;

create index if not exists orders_workspace_created_idx
  on public.orders(workspace_id, created_at desc);
create index if not exists orders_workspace_company_idx
  on public.orders(workspace_id, client_company_id);
create index if not exists orders_logist_idx
  on public.orders(logist_id) where logist_id is not null;
create index if not exists transports_workspace_created_idx
  on public.transports(workspace_id, created_at desc);
create index if not exists transports_workspace_company_idx
  on public.transports(workspace_id, client_company_id);
create index if not exists transports_order_idx on public.transports(order_id);
create index if not exists order_finance_workspace_idx on public.order_finance(workspace_id);
create index if not exists order_history_order_time_idx
  on public.order_history(order_id, created_at desc);
create index if not exists trips_transport_idx on public.trips(transport_id);
create index if not exists trip_events_transport_time_idx
  on public.trip_events(transport_id, created_at desc);
create index if not exists transport_updates_transport_time_idx
  on public.transport_updates(transport_id, created_at desc);

-- ---------------------------------------------------------------------------
-- 2. Access helpers
-- ---------------------------------------------------------------------------
-- can_access_client_company() is true for any staff member, so the client
-- branch of a policy needs its own exact check.
create or replace function public.is_client_of_company(
  p_workspace_id uuid,
  p_client_company_id uuid
)
returns boolean
language sql
security definer
set search_path = ''
stable
as $function$
  select exists (
    select 1
    from public.workspace_memberships membership
    join public.tenant_workspaces workspace on workspace.id = membership.workspace_id
    where membership.workspace_id = p_workspace_id
      and membership.user_id = auth.uid()
      and membership.status = 'active'
      and membership.role = 'client'
      and membership.client_company_id = p_client_company_id
      and workspace.status = 'active'
  )
$function$;

create or replace function public.can_read_order(p_order_id uuid)
returns boolean
language sql
security definer
set search_path = ''
stable
as $function$
  select exists (
    select 1
    from public.orders o
    where o.id = p_order_id
      and o.workspace_id is not null
      and (
        public.has_workspace_role(o.workspace_id, array['manager', 'tenant_admin'])
        or (
          o.logist_id = auth.uid()
          and public.has_workspace_role(o.workspace_id, array['logistician'])
        )
        or public.is_client_of_company(o.workspace_id, o.client_company_id)
      )
  )
$function$;

-- Staff-only view of an order: used for cost, margin and internal layers.
create or replace function public.can_manage_order(p_order_id uuid)
returns boolean
language sql
security definer
set search_path = ''
stable
as $function$
  select exists (
    select 1
    from public.orders o
    where o.id = p_order_id
      and o.workspace_id is not null
      and (
        public.has_workspace_role(o.workspace_id, array['manager', 'tenant_admin'])
        or (
          o.logist_id = auth.uid()
          and public.has_workspace_role(o.workspace_id, array['logistician'])
        )
      )
  )
$function$;

create or replace function public.can_read_transport(p_transport_id uuid)
returns boolean
language sql
security definer
set search_path = ''
stable
as $function$
  select exists (
    select 1
    from public.transports t
    where t.id = p_transport_id
      and t.workspace_id is not null
      and (
        public.has_workspace_role(t.workspace_id, array['manager', 'tenant_admin'])
        or (
          t.logist_id = auth.uid()
          and public.has_workspace_role(t.workspace_id, array['logistician'])
        )
        or public.is_client_of_company(t.workspace_id, t.client_company_id)
      )
  )
$function$;

create or replace function public.can_manage_transport(p_transport_id uuid)
returns boolean
language sql
security definer
set search_path = ''
stable
as $function$
  select exists (
    select 1
    from public.transports t
    where t.id = p_transport_id
      and t.workspace_id is not null
      and (
        public.has_workspace_role(t.workspace_id, array['manager', 'tenant_admin'])
        or (
          t.logist_id = auth.uid()
          and public.has_workspace_role(t.workspace_id, array['logistician'])
        )
      )
  )
$function$;

-- ---------------------------------------------------------------------------
-- 3. Scope integrity and column-level rules
-- ---------------------------------------------------------------------------
-- RLS cannot restrict which columns a caller changes, so the role rules that
-- depend on columns live in a trigger. A caller without auth.uid() is the
-- owner/service path (SQL editor, migrations) and is not role-checked.
create or replace function public.orders_scope_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_backfill boolean := coalesce(current_setting('exim.legacy_backfill', true), '') = 'on';
begin
  if tg_op = 'INSERT' then
    if new.workspace_id is null or new.client_company_id is null then
      raise exception 'order requires workspace and client company scope';
    end if;
    return new;
  end if;

  if new.workspace_id is distinct from old.workspace_id
     or new.client_company_id is distinct from old.client_company_id then
    if not (v_backfill and old.workspace_id is null) then
      raise exception 'order scope is immutable';
    end if;
    return new;
  end if;

  if auth.uid() is null then
    return new;
  end if;

  if new.id is distinct from old.id
     or new.ref is distinct from old.ref
     or new.created_by is distinct from old.created_by
     or new.client_id is distinct from old.client_id then
    raise exception 'order identity fields are immutable';
  end if;

  if public.has_workspace_role(old.workspace_id, array['manager', 'tenant_admin']) then
    return new;
  end if;

  if old.logist_id = auth.uid()
     and public.has_workspace_role(old.workspace_id, array['logistician']) then
    if new.total_price is distinct from old.total_price
       or new.offer_comment is distinct from old.offer_comment
       or new.offer_sent_at is distinct from old.offer_sent_at
       or new.client_decision is distinct from old.client_decision
       or new.client_decision_at is distinct from old.client_decision_at
       or new.contract_signed_at is distinct from old.contract_signed_at
       or new.logist_id is distinct from old.logist_id
       or new.calc_deadline is distinct from old.calc_deadline then
      raise exception 'logistician cannot change price, assignment or client decision';
    end if;
    if new.status not in ('assigned', 'calculated') then
      raise exception 'logistician transition is not allowed';
    end if;
    return new;
  end if;

  if public.is_client_of_company(old.workspace_id, old.client_company_id) then
    if old.status <> 'offer_sent' then
      raise exception 'client can only answer a sent offer';
    end if;
    if new.status not in ('approved', 'rejected')
       or new.client_decision is distinct from new.status then
      raise exception 'client decision must be approved or rejected';
    end if;
    if new.total_price is distinct from old.total_price
       or new.offer_comment is distinct from old.offer_comment
       or new.offer_sent_at is distinct from old.offer_sent_at
       or new.logist_id is distinct from old.logist_id
       or new.calc_deadline is distinct from old.calc_deadline
       or new.calc_route is distinct from old.calc_route
       or new.calc_days is distinct from old.calc_days
       or new.calc_comment is distinct from old.calc_comment
       or new.calc_submitted_at is distinct from old.calc_submitted_at
       or new.contract_signed_at is distinct from old.contract_signed_at
       or new.origin is distinct from old.origin
       or new.destination is distinct from old.destination
       or new.transport is distinct from old.transport
       or new.cargo is distinct from old.cargo
       or new.weight is distinct from old.weight
       or new.container is distinct from old.container
       or new.comment is distinct from old.comment then
      raise exception 'client cannot change the offer or the request';
    end if;
    return new;
  end if;

  raise exception 'order update is not allowed';
end
$function$;

drop trigger if exists trg_orders_scope_guard on public.orders;
create trigger trg_orders_scope_guard
  before insert or update on public.orders
  for each row execute function public.orders_scope_guard();

create or replace function public.transports_scope_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_backfill boolean := coalesce(current_setting('exim.legacy_backfill', true), '') = 'on';
  v_order public.orders;
begin
  if tg_op = 'INSERT' then
    if new.order_id is not null then
      select * into v_order from public.orders where id = new.order_id;
      if v_order.id is null or v_order.workspace_id is null then
        raise exception 'transport requires a scoped order';
      end if;
      -- scope always follows the source order; a caller cannot move it
      new.workspace_id := v_order.workspace_id;
      new.client_company_id := v_order.client_company_id;
    end if;
    if new.workspace_id is null or new.client_company_id is null then
      raise exception 'transport requires workspace and client company scope';
    end if;
    return new;
  end if;

  if new.workspace_id is distinct from old.workspace_id
     or new.client_company_id is distinct from old.client_company_id then
    if not (v_backfill and old.workspace_id is null) then
      raise exception 'transport scope is immutable';
    end if;
  end if;
  return new;
end
$function$;

drop trigger if exists trg_transports_scope_guard on public.transports;
create trigger trg_transports_scope_guard
  before insert or update on public.transports
  for each row execute function public.transports_scope_guard();

-- Child rows inherit the scope of their parent and can never be re-homed.
create or replace function public.inherit_order_scope()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_workspace uuid;
  v_backfill boolean := coalesce(current_setting('exim.legacy_backfill', true), '') = 'on';
begin
  if tg_op = 'UPDATE' then
    if new.workspace_id is distinct from old.workspace_id
       and not (v_backfill and old.workspace_id is null) then
      raise exception 'row scope is immutable';
    end if;
    return new;
  end if;
  select workspace_id into v_workspace from public.orders where id = new.order_id;
  if v_workspace is null then
    raise exception 'parent order has no workspace scope';
  end if;
  new.workspace_id := v_workspace;
  return new;
end
$function$;

create or replace function public.inherit_transport_scope()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_workspace uuid;
  v_backfill boolean := coalesce(current_setting('exim.legacy_backfill', true), '') = 'on';
begin
  if tg_op = 'UPDATE' then
    if new.workspace_id is distinct from old.workspace_id
       and not (v_backfill and old.workspace_id is null) then
      raise exception 'row scope is immutable';
    end if;
    return new;
  end if;
  select workspace_id into v_workspace from public.transports where id = new.transport_id;
  if v_workspace is null then
    raise exception 'parent transport has no workspace scope';
  end if;
  new.workspace_id := v_workspace;
  return new;
end
$function$;

drop trigger if exists trg_order_finance_scope on public.order_finance;
create trigger trg_order_finance_scope before insert or update on public.order_finance
  for each row execute function public.inherit_order_scope();
drop trigger if exists trg_order_history_scope on public.order_history;
create trigger trg_order_history_scope before insert or update on public.order_history
  for each row execute function public.inherit_order_scope();
drop trigger if exists trg_trips_scope on public.trips;
create trigger trg_trips_scope before insert or update on public.trips
  for each row execute function public.inherit_transport_scope();
drop trigger if exists trg_trip_events_scope on public.trip_events;
create trigger trg_trip_events_scope before insert or update on public.trip_events
  for each row execute function public.inherit_transport_scope();
drop trigger if exists trg_transport_updates_scope on public.transport_updates;
create trigger trg_transport_updates_scope before insert or update on public.transport_updates
  for each row execute function public.inherit_transport_scope();

-- ---------------------------------------------------------------------------
-- 4. Row level security
-- ---------------------------------------------------------------------------
alter table public.orders enable row level security;
alter table public.order_finance enable row level security;
alter table public.order_history enable row level security;
alter table public.transports enable row level security;
alter table public.trips enable row level security;
alter table public.trip_events enable row level security;
alter table public.transport_updates enable row level security;

-- Every pre-tenant policy on these tables is replaced: the old ones trusted
-- profiles.role globally and had no workspace boundary.
do $cleanup$
declare
  r record;
begin
  for r in
    select tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in ('orders', 'order_finance', 'order_history', 'transports',
                        'trips', 'trip_events', 'transport_updates')
  loop
    execute format('drop policy %I on public.%I', r.policyname, r.tablename);
  end loop;
end
$cleanup$;

create policy "orders scoped read" on public.orders for select using (
  workspace_id is not null
  and (
    public.has_workspace_role(workspace_id, array['manager', 'tenant_admin'])
    or (logist_id = auth.uid() and public.has_workspace_role(workspace_id, array['logistician']))
    or public.is_client_of_company(workspace_id, client_company_id)
  )
);

create policy "orders scoped insert" on public.orders for insert with check (
  workspace_id is not null
  and created_by = auth.uid()
  and public.has_module_entitlement(workspace_id, 'private_os')
  and (
    public.has_workspace_role(workspace_id, array['manager', 'tenant_admin'])
    or (client_id = auth.uid() and public.is_client_of_company(workspace_id, client_company_id))
  )
);

create policy "orders scoped update" on public.orders for update using (
  workspace_id is not null
  and public.has_module_entitlement(workspace_id, 'private_os')
  and (
    public.has_workspace_role(workspace_id, array['manager', 'tenant_admin'])
    or (logist_id = auth.uid() and public.has_workspace_role(workspace_id, array['logistician']))
    or (status = 'offer_sent' and public.is_client_of_company(workspace_id, client_company_id))
  )
) with check (
  workspace_id is not null
  and (
    public.has_workspace_role(workspace_id, array['manager', 'tenant_admin'])
    or (logist_id = auth.uid() and public.has_workspace_role(workspace_id, array['logistician']))
    or public.is_client_of_company(workspace_id, client_company_id)
  )
);

-- Cost, expenses and margin: staff of the order only. No delete policy.
create policy "order finance staff read" on public.order_finance for select using (
  public.can_manage_order(order_id)
);
create policy "order finance staff insert" on public.order_finance for insert with check (
  public.can_manage_order(order_id)
);
create policy "order finance staff update" on public.order_finance for update using (
  public.can_manage_order(order_id)
) with check (
  public.can_manage_order(order_id)
);

-- History snapshots can carry cost and internal comments, so reading is
-- staff-only. Rows are append-only: there is no update or delete policy.
create policy "order history staff read" on public.order_history for select using (
  public.can_manage_order(order_id)
);
create policy "order history participant insert" on public.order_history for insert with check (
  actor_id = auth.uid() and public.can_read_order(order_id)
);

create policy "transports scoped read" on public.transports for select using (
  workspace_id is not null
  and (
    public.has_workspace_role(workspace_id, array['manager', 'tenant_admin'])
    or (logist_id = auth.uid() and public.has_workspace_role(workspace_id, array['logistician']))
    or public.is_client_of_company(workspace_id, client_company_id)
  )
);
create policy "transports manager insert" on public.transports for insert with check (
  workspace_id is not null
  and public.has_module_entitlement(workspace_id, 'private_os')
  and public.has_workspace_role(workspace_id, array['manager', 'tenant_admin'])
);
create policy "transports staff update" on public.transports for update using (
  workspace_id is not null
  and public.has_module_entitlement(workspace_id, 'private_os')
  and (
    public.has_workspace_role(workspace_id, array['manager', 'tenant_admin'])
    or (logist_id = auth.uid() and public.has_workspace_role(workspace_id, array['logistician']))
  )
) with check (
  workspace_id is not null
  and (
    public.has_workspace_role(workspace_id, array['manager', 'tenant_admin'])
    or (logist_id = auth.uid() and public.has_workspace_role(workspace_id, array['logistician']))
  )
);

-- Trips carry carrier, vehicle and driver data: staff only. A client reads
-- the safe layer through client_trips().
create policy "trips staff read" on public.trips for select using (
  public.can_manage_transport(transport_id)
);
create policy "trips staff insert" on public.trips for insert with check (
  public.can_manage_transport(transport_id)
);
create policy "trips staff update" on public.trips for update using (
  public.can_manage_transport(transport_id)
) with check (
  public.can_manage_transport(transport_id)
);

-- Internal tracking events never reach a client.
create policy "trip events staff read" on public.trip_events for select using (
  public.can_manage_transport(transport_id)
);
create policy "trip events staff insert" on public.trip_events for insert with check (
  created_by = auth.uid() and public.can_manage_transport(transport_id)
);
create policy "trip events staff update" on public.trip_events for update using (
  public.can_manage_transport(transport_id)
) with check (
  public.can_manage_transport(transport_id)
);

-- Client-safe feed: written by a manager, read by everyone on the transport.
create policy "transport updates scoped read" on public.transport_updates for select using (
  public.can_read_transport(transport_id)
);
create policy "transport updates manager insert" on public.transport_updates for insert with check (
  published_by = auth.uid()
  and exists (
    select 1 from public.transports t
    where t.id = transport_id
      and public.has_workspace_role(t.workspace_id, array['manager', 'tenant_admin'])
  )
);

-- ---------------------------------------------------------------------------
-- 5. Privileges: forbidden fields are absent from the response, not hidden
-- ---------------------------------------------------------------------------
revoke all on public.orders from anon, authenticated;
revoke all on public.order_finance from anon, authenticated;
revoke all on public.order_history from anon, authenticated;
revoke all on public.transports from anon, authenticated;
revoke all on public.trips from anon, authenticated;
revoke all on public.trip_events from anon, authenticated;
revoke all on public.transport_updates from anon, authenticated;

-- total_price, offer_comment and calc_comment are not directly selectable:
-- they are returned only by orders_scoped() according to the caller's role.
grant select (
  id, ref, workspace_id, client_company_id, client_id, created_by,
  origin, destination, transport, cargo, weight, container, comment, status,
  logist_id, calc_deadline, calc_route, calc_days, calc_submitted_at,
  offer_sent_at, client_decision, client_decision_at, contract_signed_at,
  created_at, updated_at
) on public.orders to authenticated;
grant insert, update on public.orders to authenticated;

grant select, insert, update on public.order_finance to authenticated;
grant select, insert on public.order_history to authenticated;
grant select, insert, update on public.transports to authenticated;
grant select, insert, update on public.trips to authenticated;
grant select, insert, update on public.trip_events to authenticated;
grant select, insert on public.transport_updates to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Role-specific projections
-- ---------------------------------------------------------------------------
-- Manager / tenant admin: full row.
-- Logistician (assigned only): no client price and no offer text.
-- Client (own company only): no internal calculation comment; the price and
-- the offer text appear only after the offer has been sent.
create or replace function public.orders_scoped(p_workspace_id uuid)
returns table (
  id uuid, ref text, workspace_id uuid, client_company_id uuid,
  client_id uuid, created_by uuid, origin text, destination text,
  transport text, cargo text, weight text, container text, comment text,
  status text, logist_id uuid, calc_deadline timestamptz, calc_route text,
  calc_days text, calc_comment text, calc_submitted_at timestamptz,
  total_price numeric, offer_comment text, offer_sent_at timestamptz,
  client_decision text, client_decision_at timestamptz,
  contract_signed_at timestamptz, created_at timestamptz, updated_at timestamptz
)
language sql
security definer
set search_path = ''
stable
as $function$
  with actor as (
    select
      public.has_workspace_role(p_workspace_id, array['manager', 'tenant_admin']) as is_manager,
      public.has_workspace_role(p_workspace_id, array['logistician']) as is_logistician
  )
  select
    o.id, o.ref, o.workspace_id, o.client_company_id,
    o.client_id, o.created_by, o.origin, o.destination,
    o.transport, o.cargo, o.weight, o.container, o.comment,
    o.status, o.logist_id, o.calc_deadline, o.calc_route,
    o.calc_days,
    case when actor.is_manager or (actor.is_logistician and o.logist_id = auth.uid())
         then o.calc_comment end,
    o.calc_submitted_at,
    case when actor.is_manager then o.total_price
         when public.is_client_of_company(o.workspace_id, o.client_company_id)
              and o.offer_sent_at is not null then o.total_price end,
    case when actor.is_manager then o.offer_comment
         when public.is_client_of_company(o.workspace_id, o.client_company_id)
              and o.offer_sent_at is not null then o.offer_comment end,
    o.offer_sent_at, o.client_decision, o.client_decision_at,
    o.contract_signed_at, o.created_at, o.updated_at
  from public.orders o
  cross join actor
  where o.workspace_id = p_workspace_id
    and (
      actor.is_manager
      or (actor.is_logistician and o.logist_id = auth.uid())
      or public.is_client_of_company(o.workspace_id, o.client_company_id)
    )
  order by o.created_at desc
$function$;

-- Client-safe trip layer: sequence and stage only, no name, vehicle or driver.
create or replace function public.client_trips(p_transport_id uuid)
returns table (id uuid, transport_id uuid, status text, created_at timestamptz)
language sql
security definer
set search_path = ''
stable
as $function$
  select trip.id, trip.transport_id, trip.status, trip.created_at
  from public.trips trip
  where trip.transport_id = p_transport_id
    and public.can_read_transport(p_transport_id)
  order by trip.created_at
$function$;

-- ---------------------------------------------------------------------------
-- 7. Explicit legacy backfill (owner path only)
-- ---------------------------------------------------------------------------
-- One order at a time, with the workspace and client company named by the
-- operator. Run from the SQL editor or with the service role; API roles
-- cannot execute it.
create or replace function public.legacy_assign_order_scope(
  p_order_id uuid,
  p_workspace_id uuid,
  p_client_company_id uuid,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_transport_ids uuid[];
begin
  if char_length(btrim(coalesce(p_reason, ''))) < 3 then
    raise exception 'reason is required';
  end if;
  if not exists (
    select 1 from public.client_companies company
    where company.id = p_client_company_id and company.workspace_id = p_workspace_id
  ) then
    raise exception 'client company does not belong to the workspace';
  end if;

  perform set_config('exim.legacy_backfill', 'on', true);

  update public.orders
     set workspace_id = p_workspace_id, client_company_id = p_client_company_id
   where id = p_order_id and workspace_id is null;
  if not found then
    raise exception 'order not found or already scoped';
  end if;

  update public.order_finance set workspace_id = p_workspace_id
   where order_id = p_order_id and workspace_id is null;
  update public.order_history set workspace_id = p_workspace_id
   where order_id = p_order_id and workspace_id is null;

  select array_agg(t.id) into v_transport_ids
  from public.transports t
  where t.order_id = p_order_id and t.workspace_id is null;

  if v_transport_ids is not null then
    update public.transports
       set workspace_id = p_workspace_id, client_company_id = p_client_company_id
     where id = any(v_transport_ids);
    update public.trips set workspace_id = p_workspace_id
     where transport_id = any(v_transport_ids) and workspace_id is null;
    update public.trip_events set workspace_id = p_workspace_id
     where transport_id = any(v_transport_ids) and workspace_id is null;
    update public.transport_updates set workspace_id = p_workspace_id
     where transport_id = any(v_transport_ids) and workspace_id is null;
  end if;

  perform set_config('exim.legacy_backfill', 'off', true);

  insert into public.tenant_audit_events (
    workspace_id, actor_user_id, action, object_type, object_id, after_state, reason
  ) values (
    p_workspace_id, auth.uid(), 'legacy.order_scope_assigned', 'order', p_order_id::text,
    jsonb_build_object(
      'client_company_id', p_client_company_id,
      'transports', coalesce(array_length(v_transport_ids, 1), 0)
    ),
    btrim(p_reason)
  );
end
$function$;

revoke all on function public.is_client_of_company(uuid, uuid) from public, anon;
revoke all on function public.can_read_order(uuid) from public, anon;
revoke all on function public.can_manage_order(uuid) from public, anon;
revoke all on function public.can_read_transport(uuid) from public, anon;
revoke all on function public.can_manage_transport(uuid) from public, anon;
revoke all on function public.orders_scoped(uuid) from public, anon;
revoke all on function public.client_trips(uuid) from public, anon;
grant execute on function public.is_client_of_company(uuid, uuid) to authenticated;
grant execute on function public.can_read_order(uuid) to authenticated;
grant execute on function public.can_manage_order(uuid) to authenticated;
grant execute on function public.can_read_transport(uuid) to authenticated;
grant execute on function public.can_manage_transport(uuid) to authenticated;
grant execute on function public.orders_scoped(uuid) to authenticated;
grant execute on function public.client_trips(uuid) to authenticated;

revoke all on function public.legacy_assign_order_scope(uuid, uuid, uuid, text)
  from public, anon, authenticated;
revoke all on function public.orders_scope_guard() from public, anon, authenticated;
revoke all on function public.transports_scope_guard() from public, anon, authenticated;
revoke all on function public.inherit_order_scope() from public, anon, authenticated;
revoke all on function public.inherit_transport_scope() from public, anon, authenticated;

commit;
