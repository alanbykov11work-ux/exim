-- TASK-2026-001 Wave 4a (REQ-006): selected rate, agreement basis (contract gate), exactly one Shipment.
-- Depends on: foundation_wave_3e_clarifications.sql (and 3a/3b).

-- 1. The manager chooses one active rate; the choice is kept on the order and in history.
alter table public.orders add column if not exists selected_rate_id uuid references public.rate_quotes (id);
-- not readable by clients (column grants from Wave 1b do not include it)

create or replace function public.select_rate(p_order_id uuid, p_rate_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_order public.orders%rowtype;
  v_actor text := coalesce(current_setting('request.jwt.claim.sub', true), '');
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if not found or v_order.workspace_id is null
     or not public.has_workspace_role(v_order.workspace_id, array['manager', 'tenant_admin']) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if v_order.status not in ('calculated', 'offer_sent', 'rejected') then
    raise exception 'rate cannot be selected in status %', v_order.status using errcode = '22023';
  end if;
  if not exists (select 1 from public.rate_quotes r where r.id = p_rate_id and r.order_id = p_order_id and r.status = 'active') then
    raise exception 'rate is not an active rate of this order' using errcode = '22023';
  end if;
  update public.orders set selected_rate_id = p_rate_id where id = p_order_id;
  insert into public.tenant_audit_events(workspace_id, actor_user_id, action, object_type, object_id, before_state, after_state)
  values (v_order.workspace_id, auth.uid(), 'order.rate_selected', 'order', p_order_id::text,
          jsonb_build_object('rate_id', v_order.selected_rate_id), jsonb_build_object('rate_id', p_rate_id));
end
$function$;

-- 2. Agreement basis: approval of an offer is not a contract.
create table if not exists public.agreement_bases (
  id           uuid primary key default gen_random_uuid(),
  order_id     uuid not null unique references public.orders (id) on delete restrict,
  offer_id     uuid not null references public.commercial_offers (id),
  workspace_id uuid not null references public.tenant_workspaces (id),
  kind         text not null check (kind in ('contract', 'addendum', 'signed_offer', 'invoice_paid')),
  doc_number   text check (doc_number is null or length(doc_number) <= 100),
  signed_on    date not null,
  comment      text check (comment is null or length(comment) <= 2000),
  created_by   uuid not null references auth.users (id),
  created_at   timestamptz not null default now()
);
alter table public.agreement_bases enable row level security;
drop policy if exists agreement_bases_select on public.agreement_bases;
create policy agreement_bases_select on public.agreement_bases for select to authenticated
  using (public.can_read_order(order_id));
revoke all on public.agreement_bases from anon, authenticated;
grant select (id, order_id, offer_id, workspace_id, kind, doc_number, signed_on, created_at)
  on public.agreement_bases to authenticated;

create or replace function public.record_agreement(
  p_order_id uuid, p_kind text, p_signed_on date, p_doc_number text default null, p_comment text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_order public.orders%rowtype;
  v_offer uuid;
  v_id uuid;
  v_actor text := coalesce(current_setting('request.jwt.claim.sub', true), '');
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if not found or v_order.workspace_id is null
     or not public.has_workspace_role(v_order.workspace_id, array['manager', 'tenant_admin']) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select a.id into v_id from public.agreement_bases a where a.order_id = p_order_id;
  if v_id is not null then
    return v_id;  -- repeated action does not create a second basis
  end if;
  if v_order.status <> 'approved' then
    raise exception 'agreement requires an approved offer' using errcode = '22023';
  end if;
  select c.id into v_offer from public.commercial_offers c where c.order_id = p_order_id and c.status = 'approved';
  if v_offer is null then
    raise exception 'agreement requires an approved offer' using errcode = '22023';
  end if;
  if p_signed_on is null or p_signed_on > current_date then
    raise exception 'signing date is required and cannot be in the future' using errcode = '22023';
  end if;
  insert into public.agreement_bases(order_id, offer_id, workspace_id, kind, doc_number, signed_on, comment, created_by)
  values (p_order_id, v_offer, v_order.workspace_id, p_kind, nullif(btrim(p_doc_number), ''), p_signed_on,
          nullif(btrim(p_comment), ''), auth.uid())
  returning id into v_id;
  perform set_config('request.jwt.claim.sub', '', true);
  update public.orders set status = 'contract_signed', contract_signed_at = now() where id = p_order_id;
  perform set_config('request.jwt.claim.sub', v_actor, true);
  insert into public.tenant_audit_events(workspace_id, actor_user_id, action, object_type, object_id, after_state)
  values (v_order.workspace_id, auth.uid(), 'order.agreement_recorded', 'order', p_order_id::text,
          jsonb_build_object('agreement_id', v_id, 'offer_id', v_offer, 'kind', p_kind));
  return v_id;
end
$function$;

-- The contract_signed status can be set only by record_agreement.
create or replace function public.orders_contract_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if new.workspace_id is not null and new.status is distinct from old.status
     and new.status in ('contract_signed', 'converted')
     and not exists (select 1 from public.agreement_bases a where a.order_id = new.id) then
    raise exception 'agreement basis is required' using errcode = '42501';
  end if;
  if new.workspace_id is not null and new.status is distinct from old.status and new.status = 'converted'
     and coalesce(current_setting('exim.shipment_create', true), '') <> 'on' then
    raise exception 'use create_shipment' using errcode = '42501';
  end if;
  return new;
end
$function$;
drop trigger if exists orders_contract_guard on public.orders;
create trigger orders_contract_guard before update of status on public.orders
  for each row execute function public.orders_contract_guard();

-- 3. Shipment (transports) keeps links to request, offer, agreement and rate; one per order.
alter table public.transports
  add column if not exists offer_id     uuid references public.commercial_offers (id),
  add column if not exists agreement_id uuid references public.agreement_bases (id),
  add column if not exists rate_id      uuid references public.rate_quotes (id);
create unique index if not exists transports_one_per_order on public.transports (order_id) where order_id is not null;
grant select (offer_id, agreement_id) on public.transports to authenticated;

create or replace function public.transports_create_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if coalesce(current_setting('exim.shipment_create', true), '') <> 'on'
     and (new.workspace_id is not null or new.order_id is not null) then
    raise exception 'use create_shipment' using errcode = '42501';
  end if;
  return new;
end
$function$;
drop trigger if exists transports_create_guard on public.transports;
create trigger transports_create_guard before insert on public.transports
  for each row execute function public.transports_create_guard();

create or replace function public.create_shipment(p_order_id uuid, p_ref text default null)
returns table (transport_id uuid, ref text, created boolean)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_order public.orders%rowtype;
  v_agr public.agreement_bases%rowtype;
  v_id uuid;
  v_ref text;
  v_actor uuid := auth.uid();
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if not found or v_order.workspace_id is null
     or not public.has_workspace_role(v_order.workspace_id, array['manager', 'tenant_admin']) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select t.id, t.ref into v_id, v_ref from public.transports t where t.order_id = p_order_id;
  if v_id is not null then
    return query select v_id, v_ref, false;
    return;
  end if;
  select * into v_agr from public.agreement_bases a where a.order_id = p_order_id;
  if not found or v_order.status <> 'contract_signed' then
    raise exception 'shipment requires an agreement basis' using errcode = '22023';
  end if;
  v_ref := nullif(btrim(p_ref), '');
  if v_ref is null or v_ref !~ '^[A-Za-z0-9-]{3,40}$' or exists (select 1 from public.transports t where t.ref = v_ref) then
    v_ref := 'TR-' || to_char(now(), 'YYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 5));
  end if;
  perform set_config('exim.shipment_create', 'on', true);
  insert into public.transports(ref, order_id, client_id, manager_id, logist_id, origin, destination,
                                workspace_id, client_company_id, offer_id, agreement_id, rate_id)
  values (v_ref, p_order_id, v_order.client_id, v_actor, v_order.logist_id, v_order.origin, v_order.destination,
          v_order.workspace_id, v_order.client_company_id, v_agr.offer_id, v_agr.id, v_order.selected_rate_id)
  returning id into v_id;
  perform set_config('request.jwt.claim.sub', '', true);
  update public.orders set status = 'converted' where id = p_order_id;
  perform set_config('request.jwt.claim.sub', coalesce(v_actor::text, ''), true);
  perform set_config('exim.shipment_create', '', true);
  insert into public.tenant_audit_events(workspace_id, actor_user_id, action, object_type, object_id, after_state)
  values (v_order.workspace_id, v_actor, 'shipment.created', 'transport', v_id::text,
          jsonb_build_object('order_id', p_order_id, 'agreement_id', v_agr.id, 'offer_id', v_agr.offer_id,
                             'rate_id', v_order.selected_rate_id));
  return query select v_id, v_ref, true;
end
$function$;

revoke all on function public.select_rate(uuid, uuid) from public, anon;
revoke all on function public.record_agreement(uuid, text, date, text, text) from public, anon;
revoke all on function public.create_shipment(uuid, text) from public, anon;
grant execute on function public.select_rate(uuid, uuid) to authenticated;
grant execute on function public.record_agreement(uuid, text, date, text, text) to authenticated;
grant execute on function public.create_shipment(uuid, text) to authenticated;
