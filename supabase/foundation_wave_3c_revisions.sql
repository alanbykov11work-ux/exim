-- TASK-2026-001 Wave 3c: request revisions.
-- Request fields (route, cargo, transport) change only through revise_order(); every
-- version is kept, and a changed request invalidates rates and returns to calculation.
-- Depends on: foundation_wave_1b_legacy_scope.sql, foundation_wave_3a_rate_quotes.sql, foundation_wave_3b_offers.sql.

create table if not exists public.order_revisions (
  id           bigint generated always as identity primary key,
  order_id     uuid not null references public.orders (id) on delete restrict,
  workspace_id uuid not null references public.tenant_workspaces (id),
  revision     int not null check (revision > 0),
  data         jsonb not null,
  reason       text check (reason is null or length(reason) <= 2000),
  changed_by   uuid references auth.users (id),
  created_at   timestamptz not null default now(),
  unique (order_id, revision)
);

alter table public.rate_quotes add column if not exists order_revision int;

alter table public.order_revisions enable row level security;
drop policy if exists order_revisions_select on public.order_revisions;
create policy order_revisions_select on public.order_revisions for select to authenticated
  using (public.can_read_order(order_id));
revoke all on public.order_revisions from anon, authenticated;
grant select on public.order_revisions to authenticated;

create or replace function public.order_request_data(o public.orders)
returns jsonb
language sql
immutable
set search_path = ''
as $function$
  select jsonb_build_object('origin', o.origin, 'destination', o.destination, 'transport', o.transport,
    'cargo', o.cargo, 'weight', o.weight, 'container', o.container, 'comment', o.comment)
$function$;

create or replace function public.order_current_revision(p_order_id uuid)
returns int
language sql
stable
security definer
set search_path = ''
as $function$
  select coalesce(max(revision), 0) from public.order_revisions where order_id = p_order_id
$function$;

-- Revision 1 is recorded when a scoped order is created.
create or replace function public.order_revisions_on_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if new.workspace_id is not null then
    insert into public.order_revisions(order_id, workspace_id, revision, data, changed_by)
    values (new.id, new.workspace_id, 1, public.order_request_data(new), auth.uid());
  end if;
  return new;
end
$function$;
drop trigger if exists order_revisions_on_insert on public.orders;
create trigger order_revisions_on_insert after insert on public.orders
  for each row execute function public.order_revisions_on_insert();

-- Direct edits of request fields are closed for scoped orders.
create or replace function public.orders_request_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if old.workspace_id is not null
     and public.order_request_data(new) is distinct from public.order_request_data(old)
     and coalesce(current_setting('exim.order_revision', true), '') <> 'on' then
    raise exception 'use revise_order to change the request' using errcode = '42501';
  end if;
  return new;
end
$function$;
drop trigger if exists orders_request_guard on public.orders;
create trigger orders_request_guard before update on public.orders
  for each row execute function public.orders_request_guard();

-- Rates are tied to the revision they were given for.
create or replace function public.rate_quotes_revision()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  new.order_revision := public.order_current_revision(new.order_id);
  return new;
end
$function$;
drop trigger if exists rate_quotes_revision on public.rate_quotes;
create trigger rate_quotes_revision before insert on public.rate_quotes
  for each row execute function public.rate_quotes_revision();

create or replace function public.revise_order(p_order_id uuid, p_data jsonb, p_reason text default null)
returns int
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_order public.orders%rowtype;
  v_actor uuid := auth.uid();
  v_staff boolean;
  v_new jsonb;
  v_rev int;
  v_status text;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if not found or v_order.workspace_id is null then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  v_staff := public.has_workspace_role(v_order.workspace_id, array['manager', 'tenant_admin']);
  if not v_staff and not public.is_client_of_company(v_order.workspace_id, v_order.client_company_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if v_order.status not in ('new', 'assigned', 'calculated')
     and not (v_staff and v_order.status = 'rejected') then
    raise exception 'request cannot be changed in status %', v_order.status using errcode = '22023';
  end if;
  if p_data is null or jsonb_typeof(p_data) <> 'object'
     or exists (select 1 from jsonb_object_keys(p_data) k
                where k not in ('origin', 'destination', 'transport', 'cargo', 'weight', 'container', 'comment')) then
    raise exception 'unknown request fields' using errcode = '22023';
  end if;
  v_new := public.order_request_data(v_order) || p_data;
  if length(btrim(coalesce(v_new->>'origin', ''))) = 0 or length(btrim(coalesce(v_new->>'destination', ''))) = 0 then
    raise exception 'origin and destination are required' using errcode = '22023';
  end if;
  if v_new = public.order_request_data(v_order) then
    return public.order_current_revision(p_order_id);
  end if;

  v_rev := public.order_current_revision(p_order_id) + 1;
  insert into public.order_revisions(order_id, workspace_id, revision, data, reason, changed_by)
  values (p_order_id, v_order.workspace_id, v_rev, v_new, p_reason, v_actor);

  update public.rate_quotes set status = 'withdrawn'
   where order_id = p_order_id and status = 'active';

  v_status := case when v_order.logist_id is null then 'new' else 'assigned' end;
  perform set_config('exim.order_revision', 'on', true);
  -- the role guard from Wave 1b is skipped for this one controlled write
  perform set_config('exim.trusted', 'on', true);
  update public.orders
     set origin = v_new->>'origin', destination = v_new->>'destination',
         transport = coalesce(v_new->>'transport', ''), cargo = coalesce(v_new->>'cargo', ''),
         weight = coalesce(v_new->>'weight', ''), container = coalesce(v_new->>'container', ''),
         comment = coalesce(v_new->>'comment', ''),
         status = v_status, calc_submitted_at = null
   where id = p_order_id;
  perform set_config('exim.trusted', '', true);
  perform set_config('exim.order_revision', '', true);
  return v_rev;
end
$function$;

revoke all on function public.revise_order(uuid, jsonb, text) from public, anon;
revoke all on function public.order_current_revision(uuid) from public, anon, authenticated;
grant execute on function public.revise_order(uuid, jsonb, text) to authenticated;
