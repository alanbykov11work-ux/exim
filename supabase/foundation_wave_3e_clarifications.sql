-- TASK-2026-001 Wave 3e: clarification loops and price change reasons (REQ-001).
-- Depends on: foundation_wave_3d_request_form.sql.

alter table public.orders drop constraint if exists orders_status_check;
alter table public.orders add constraint orders_status_check check (status in
  ('draft','new','clarification','assigned','calculated','offer_sent','approved','rejected',
   'contract_signed','converted','archived'));

alter table public.commercial_offers drop constraint if exists commercial_offers_status_check;
alter table public.commercial_offers add constraint commercial_offers_status_check
  check (status in ('sent', 'superseded', 'approved', 'rejected', 'clarification'));
alter table public.commercial_offers add column if not exists price_reason text
  check (price_reason is null or length(price_reason) <= 2000);
alter table public.commercial_offers add column if not exists previous_price numeric(14,2);

create table if not exists public.order_clarifications (
  id           bigint generated always as identity primary key,
  order_id     uuid not null references public.orders (id) on delete restrict,
  workspace_id uuid not null references public.tenant_workspaces (id),
  direction    text not null check (direction in ('to_client', 'to_manager')),
  offer_id     uuid references public.commercial_offers (id),
  message      text not null check (length(btrim(message)) between 3 and 4000),
  author_id    uuid references auth.users (id),
  created_at   timestamptz not null default now()
);
alter table public.order_clarifications enable row level security;
drop policy if exists order_clarifications_select on public.order_clarifications;
create policy order_clarifications_select on public.order_clarifications for select to authenticated
  using (public.can_read_order(order_id));
revoke all on public.order_clarifications from anon, authenticated;
grant select on public.order_clarifications to authenticated;

-- Internal status write that bypasses the role guard for one controlled change.
create or replace function public.set_order_status_internal(p_order_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor text := coalesce(current_setting('request.jwt.claim.sub', true), '');
begin
  perform set_config('exim.offer_flow', 'on', true);
  perform set_config('request.jwt.claim.sub', '', true);
  update public.orders set status = p_status where id = p_order_id;
  perform set_config('request.jwt.claim.sub', v_actor, true);
  perform set_config('exim.offer_flow', '', true);
end
$function$;
revoke all on function public.set_order_status_internal(uuid, text) from public, anon, authenticated;

-- Manager returns a new request to the client for clarification.
create or replace function public.return_for_clarification(p_order_id uuid, p_message text)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_order public.orders%rowtype;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if not found or v_order.workspace_id is null
     or not public.has_workspace_role(v_order.workspace_id, array['manager', 'tenant_admin']) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if v_order.status <> 'new' then
    raise exception 'only a new request can be returned' using errcode = '22023';
  end if;
  insert into public.order_clarifications(order_id, workspace_id, direction, message, author_id)
  values (p_order_id, v_order.workspace_id, 'to_client', p_message, auth.uid());
  perform public.set_order_status_internal(p_order_id, 'clarification');
end
$function$;

-- Client answers a returned request without changing fields.
create or replace function public.answer_clarification(p_order_id uuid, p_message text)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_order public.orders%rowtype;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if not found or v_order.workspace_id is null
     or not public.is_client_of_company(v_order.workspace_id, v_order.client_company_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if v_order.status <> 'clarification' then
    raise exception 'request is not awaiting clarification' using errcode = '22023';
  end if;
  insert into public.order_clarifications(order_id, workspace_id, direction, message, author_id)
  values (p_order_id, v_order.workspace_id, 'to_manager', p_message, auth.uid());
  perform public.set_order_status_internal(p_order_id, 'new');
end
$function$;

-- Client asks a question about the open offer version instead of approving or rejecting.
create or replace function public.request_offer_clarification(p_offer_id uuid, p_message text)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_offer public.commercial_offers%rowtype;
  v_company uuid;
begin
  select * into v_offer from public.commercial_offers where id = p_offer_id for update;
  if not found then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select o.client_company_id into v_company from public.orders o where o.id = v_offer.order_id for update;
  if not public.is_client_of_company(v_offer.workspace_id, v_company) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if v_offer.status <> 'sent' then
    raise exception 'offer version % is no longer open', v_offer.version using errcode = '22023';
  end if;
  insert into public.order_clarifications(order_id, workspace_id, direction, offer_id, message, author_id)
  values (v_offer.order_id, v_offer.workspace_id, 'to_manager', p_offer_id, p_message, auth.uid());
  update public.commercial_offers set status = 'clarification', decided_by = auth.uid(), decided_at = now()
   where id = p_offer_id;
  perform public.set_order_status_internal(v_offer.order_id, 'calculated');
end
$function$;

-- revise_order also works while the request is returned for clarification.
do $do$
declare v_src text;
begin
  select pg_get_functiondef('public.revise_order(uuid, jsonb, text)'::regprocedure) into v_src;
  v_src := replace(v_src, $$v_order.status not in ('new', 'assigned', 'calculated')$$,
                          $$v_order.status not in ('new', 'clarification', 'assigned', 'calculated')$$);
  execute v_src;
end
$do$;

-- send_offer: a new price after an earlier version requires a reason; old price is kept.
drop function if exists public.send_offer(uuid, numeric, text, text, date);
create or replace function public.send_offer(
  p_order_id uuid, p_total numeric, p_currency text default 'KZT',
  p_comment text default null, p_valid_until date default null, p_price_reason text default null)
returns table (offer_id uuid, version int)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_order public.orders%rowtype;
  v_prev public.commercial_offers%rowtype;
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
  select * into v_prev from public.commercial_offers c where c.order_id = p_order_id
   order by c.version desc limit 1;
  if found and v_prev.total_price <> p_total and length(btrim(coalesce(p_price_reason, ''))) < 3 then
    raise exception 'price change requires a reason' using errcode = '23502';
  end if;
  update public.commercial_offers set status = 'superseded' where order_id = p_order_id and status = 'sent';
  v_version := coalesce(v_prev.version, 0) + 1;
  insert into public.commercial_offers(order_id, workspace_id, version, total_price, currency, comment,
                                       valid_until, created_by, price_reason, previous_price)
  values (p_order_id, v_order.workspace_id, v_version, p_total, upper(coalesce(p_currency, 'KZT')), p_comment,
          p_valid_until, auth.uid(), nullif(btrim(p_price_reason), ''), v_prev.total_price)
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

revoke all on function public.send_offer(uuid, numeric, text, text, date, text) from public, anon;
revoke all on function public.return_for_clarification(uuid, text) from public, anon;
revoke all on function public.answer_clarification(uuid, text) from public, anon;
revoke all on function public.request_offer_clarification(uuid, text) from public, anon;
grant execute on function public.send_offer(uuid, numeric, text, text, date, text) to authenticated;
grant execute on function public.return_for_clarification(uuid, text) to authenticated;
grant execute on function public.answer_clarification(uuid, text) to authenticated;
grant execute on function public.request_offer_clarification(uuid, text) to authenticated;

-- The reason of a price change is internal: clients get the offer without it.
revoke select on public.commercial_offers from authenticated;
grant select (id, order_id, workspace_id, version, total_price, currency, comment, valid_until,
              status, created_by, created_at, decided_by, decided_at)
  on public.commercial_offers to authenticated;

create or replace function public.offer_price_history(p_order_id uuid)
returns table (version int, total_price numeric, previous_price numeric, price_reason text,
               status text, created_by uuid, created_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $function$
  select c.version, c.total_price, c.previous_price, c.price_reason, c.status, c.created_by, c.created_at
  from public.commercial_offers c
  where c.order_id = p_order_id
    and exists (select 1 from public.orders o where o.id = p_order_id
                and public.has_workspace_role(o.workspace_id, array['manager', 'tenant_admin']))
  order by c.version
$function$;
revoke all on function public.offer_price_history(uuid) from public, anon;
grant execute on function public.offer_price_history(uuid) to authenticated;
