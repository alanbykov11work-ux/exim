-- TASK-2026-001 Wave 3b: versioned CommercialOffer; the client's decision binds to a version.
-- Depends on: foundation_wave_1b_legacy_scope.sql, foundation_wave_1c_work_scope.sql, foundation_wave_3a_rate_quotes.sql.

create table if not exists public.commercial_offers (
  id           uuid primary key default gen_random_uuid(),
  order_id     uuid not null references public.orders (id) on delete restrict,
  workspace_id uuid not null references public.tenant_workspaces (id),
  version      int  not null check (version > 0),
  total_price  numeric(14,2) not null check (total_price > 0),
  currency     text not null default 'KZT' check (currency ~ '^[A-Z]{3}$'),
  comment      text check (comment is null or length(comment) <= 4000),
  valid_until  date,
  status       text not null default 'sent' check (status in ('sent', 'superseded', 'approved', 'rejected')),
  created_by   uuid not null references auth.users (id),
  created_at   timestamptz not null default now(),
  decided_by   uuid references auth.users (id),
  decided_at   timestamptz,
  unique (order_id, version)
);
create unique index if not exists commercial_offers_one_open
  on public.commercial_offers (order_id) where status = 'sent';

alter table public.commercial_offers enable row level security;
drop policy if exists commercial_offers_select on public.commercial_offers;
create policy commercial_offers_select on public.commercial_offers for select to authenticated
  using (public.can_read_order(order_id));
revoke all on public.commercial_offers from anon, authenticated;
grant select on public.commercial_offers to authenticated;

-- Orders may enter or leave offer_sent only through the functions below.
create or replace function public.orders_offer_flow_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if new.workspace_id is not null
     and new.status is distinct from old.status
     and (new.status = 'offer_sent' or old.status = 'offer_sent')
     and coalesce(current_setting('exim.offer_flow', true), '') <> 'on' then
    raise exception 'use send_offer / decide_offer' using errcode = '42501';
  end if;
  return new;
end
$function$;
drop trigger if exists orders_offer_flow_guard on public.orders;
create trigger orders_offer_flow_guard before update of status on public.orders
  for each row execute function public.orders_offer_flow_guard();

create or replace function public.send_offer(
  p_order_id uuid, p_total numeric, p_currency text default 'KZT',
  p_comment text default null, p_valid_until date default null)
returns table (offer_id uuid, version int)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_order public.orders%rowtype;
  v_version int;
  v_id uuid;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if not found or v_order.workspace_id is null
     or not public.has_workspace_role(v_order.workspace_id, array['manager', 'tenant_admin']) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if v_order.status not in ('calculated', 'offer_sent', 'rejected') then
    raise exception 'offer cannot be sent in status %', v_order.status using errcode = '22023';
  end if;
  update public.commercial_offers set status = 'superseded'
   where order_id = p_order_id and status = 'sent';
  select coalesce(max(c.version), 0) + 1 into v_version from public.commercial_offers c where c.order_id = p_order_id;
  insert into public.commercial_offers(order_id, workspace_id, version, total_price, currency, comment, valid_until, created_by)
  values (p_order_id, v_order.workspace_id, v_version, p_total, upper(coalesce(p_currency, 'KZT')), p_comment, p_valid_until, auth.uid())
  returning id into v_id;
  perform set_config('exim.offer_flow', 'on', true);
  update public.orders
     set total_price = p_total, offer_comment = p_comment, offer_sent_at = now(),
         status = 'offer_sent', client_decision = null, client_decision_at = null
   where id = p_order_id;
  perform set_config('exim.offer_flow', '', true);
  return query select v_id, v_version;
end
$function$;

create or replace function public.decide_offer(p_offer_id uuid, p_decision text)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_offer public.commercial_offers%rowtype;
  v_company uuid;
begin
  if p_decision not in ('approved', 'rejected') then
    raise exception 'decision must be approved or rejected' using errcode = '22023';
  end if;
  select * into v_offer from public.commercial_offers where id = p_offer_id for update;
  if not found then
    raise exception 'offer not found' using errcode = '42501';
  end if;
  select o.client_company_id into v_company from public.orders o where o.id = v_offer.order_id for update;
  if not public.is_client_of_company(v_offer.workspace_id, v_company) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if v_offer.status <> 'sent' then
    raise exception 'offer version % is no longer open', v_offer.version using errcode = '22023';
  end if;
  update public.commercial_offers
     set status = p_decision, decided_by = auth.uid(), decided_at = now()
   where id = p_offer_id;
  perform set_config('exim.offer_flow', 'on', true);
  update public.orders
     set status = p_decision, client_decision = p_decision, client_decision_at = now()
   where id = v_offer.order_id and status = 'offer_sent';
  perform set_config('exim.offer_flow', '', true);
end
$function$;

-- Legacy entry point now decides the current open version only.
create or replace function public.decide_order(p_order_id uuid, p_decision text)
returns void
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_id uuid;
begin
  select c.id into v_id from public.commercial_offers c
   where c.order_id = p_order_id and c.status = 'sent';
  if v_id is null then
    raise exception 'offer is not awaiting a decision';
  end if;
  perform public.decide_offer(v_id, p_decision);
end
$function$;

revoke all on function public.send_offer(uuid, numeric, text, text, date) from public, anon;
revoke all on function public.decide_offer(uuid, text) from public, anon;
grant execute on function public.send_offer(uuid, numeric, text, text, date) to authenticated;
grant execute on function public.decide_offer(uuid, text) to authenticated;
