-- TASK-2026-001 Wave 3d: REQ-001 request form — full field set, drafts, idempotent submit.
-- Depends on: foundation_wave_3c_revisions.sql.

alter table public.orders drop constraint if exists orders_status_check;
alter table public.orders add constraint orders_status_check check (status in
  ('draft','new','assigned','calculated','offer_sent','approved','rejected','contract_signed','converted','archived'));

alter table public.orders
  add column if not exists contact_name      text check (contact_name is null or length(contact_name) <= 200),
  add column if not exists contact_phone     text check (contact_phone is null or length(contact_phone) <= 50),
  add column if not exists ready_date        date,
  add column if not exists places            int check (places is null or places > 0),
  add column if not exists weight_kg         numeric(14,3) check (weight_kg is null or weight_kg > 0),
  add column if not exists volume_m3         numeric(14,3) check (volume_m3 is null or volume_m3 > 0),
  add column if not exists dimensions        text check (dimensions is null or length(dimensions) <= 500),
  add column if not exists packaging         text check (packaging is null or length(packaging) <= 200),
  add column if not exists stackable         boolean,
  add column if not exists loading_method    text check (loading_method is null or length(loading_method) <= 200),
  add column if not exists incoterms         text check (incoterms is null or incoterms in
    ('EXW','FCA','FAS','FOB','CFR','CIF','CPT','CIP','DAP','DPU','DDP')),
  add column if not exists hs_code           text check (hs_code is null or hs_code ~ '^[0-9]{4,10}$'),
  add column if not exists consignee         text check (consignee is null or length(consignee) <= 500),
  add column if not exists client_request_id uuid;
create unique index if not exists orders_client_request_uidx
  on public.orders (created_by, client_request_id) where client_request_id is not null;

-- The request snapshot now carries every REQ-001 field.
create or replace function public.order_request_data(o public.orders)
returns jsonb
language sql
immutable
set search_path = ''
as $function$
  select jsonb_build_object('origin', o.origin, 'destination', o.destination, 'transport', o.transport,
    'cargo', o.cargo, 'weight', o.weight, 'container', o.container, 'comment', o.comment,
    'contact_name', o.contact_name, 'contact_phone', o.contact_phone, 'ready_date', o.ready_date,
    'places', o.places, 'weight_kg', o.weight_kg, 'volume_m3', o.volume_m3, 'dimensions', o.dimensions,
    'packaging', o.packaging, 'stackable', o.stackable, 'loading_method', o.loading_method,
    'incoterms', o.incoterms, 'hs_code', o.hs_code, 'consignee', o.consignee)
$function$;

-- Writes request fields from a jsonb object; caller must have checked access.
create or replace function public.apply_request_data(p_order_id uuid, p_data jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor text := coalesce(current_setting('request.jwt.claim.sub', true), '');
  v_keys text[] := array['origin','destination','transport','cargo','weight','container','comment',
    'contact_name','contact_phone','ready_date','places','weight_kg','volume_m3','dimensions',
    'packaging','stackable','loading_method','incoterms','hs_code','consignee'];
begin
  if p_data is null or jsonb_typeof(p_data) <> 'object'
     or exists (select 1 from jsonb_object_keys(p_data) k where k <> all (v_keys)) then
    raise exception 'unknown request fields' using errcode = '22023';
  end if;
  perform set_config('exim.order_revision', 'on', true);
  perform set_config('exim.trusted', 'on', true);
  update public.orders o set
    origin         = case when p_data ? 'origin' then coalesce(p_data->>'origin', '') else o.origin end,
    destination    = case when p_data ? 'destination' then coalesce(p_data->>'destination', '') else o.destination end,
    transport      = case when p_data ? 'transport' then coalesce(p_data->>'transport', '') else o.transport end,
    cargo          = case when p_data ? 'cargo' then coalesce(p_data->>'cargo', '') else o.cargo end,
    weight         = case when p_data ? 'weight' then coalesce(p_data->>'weight', '') else o.weight end,
    container      = case when p_data ? 'container' then coalesce(p_data->>'container', '') else o.container end,
    comment        = case when p_data ? 'comment' then coalesce(p_data->>'comment', '') else o.comment end,
    contact_name   = case when p_data ? 'contact_name' then nullif(btrim(p_data->>'contact_name'), '') else o.contact_name end,
    contact_phone  = case when p_data ? 'contact_phone' then nullif(btrim(p_data->>'contact_phone'), '') else o.contact_phone end,
    ready_date     = case when p_data ? 'ready_date' then nullif(p_data->>'ready_date', '')::date else o.ready_date end,
    places         = case when p_data ? 'places' then nullif(p_data->>'places', '')::int else o.places end,
    weight_kg      = case when p_data ? 'weight_kg' then nullif(p_data->>'weight_kg', '')::numeric else o.weight_kg end,
    volume_m3      = case when p_data ? 'volume_m3' then nullif(p_data->>'volume_m3', '')::numeric else o.volume_m3 end,
    dimensions     = case when p_data ? 'dimensions' then nullif(btrim(p_data->>'dimensions'), '') else o.dimensions end,
    packaging      = case when p_data ? 'packaging' then nullif(btrim(p_data->>'packaging'), '') else o.packaging end,
    stackable      = case when p_data ? 'stackable' then (p_data->>'stackable')::boolean else o.stackable end,
    loading_method = case when p_data ? 'loading_method' then nullif(btrim(p_data->>'loading_method'), '') else o.loading_method end,
    incoterms      = case when p_data ? 'incoterms' then nullif(upper(btrim(p_data->>'incoterms')), '') else o.incoterms end,
    hs_code        = case when p_data ? 'hs_code' then nullif(btrim(p_data->>'hs_code'), '') else o.hs_code end,
    consignee      = case when p_data ? 'consignee' then nullif(btrim(p_data->>'consignee'), '') else o.consignee end
  where o.id = p_order_id;
  perform set_config('exim.trusted', '', true);
  perform set_config('exim.order_revision', '', true);
end
$function$;
revoke all on function public.apply_request_data(uuid, jsonb) from public, anon, authenticated;

-- Fields required to leave draft (REQ-001, D-042).
create or replace function public.request_missing_fields(p_order_id uuid)
returns text[]
language sql
stable
security definer
set search_path = ''
as $function$
  select array_remove(array[
    case when length(btrim(coalesce(o.contact_name, ''))) = 0 then 'contact_name' end,
    case when length(btrim(coalesce(o.origin, ''))) = 0 then 'origin' end,
    case when length(btrim(coalesce(o.destination, ''))) = 0 then 'destination' end,
    case when length(btrim(coalesce(o.cargo, ''))) = 0 then 'cargo' end,
    case when o.weight_kg is null then 'weight_kg' end,
    case when o.volume_m3 is null then 'volume_m3' end], null)
  from public.orders o where o.id = p_order_id
$function$;
revoke all on function public.request_missing_fields(uuid) from public, anon, authenticated;

-- Create or update a request. Repeating the same client_request_id never creates a duplicate.
create or replace function public.save_request(
  p_client_request_id uuid, p_company_id uuid, p_data jsonb, p_submit boolean default false)
returns table (order_id uuid, ref text, status text, missing text[])
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor uuid := auth.uid();
  v_ws uuid;
  v_order public.orders%rowtype;
  v_missing text[];
begin
  if v_actor is null or p_client_request_id is null then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select c.workspace_id into v_ws from public.client_companies c where c.id = p_company_id;
  if v_ws is null
     or not (public.is_client_of_company(v_ws, p_company_id)
             or public.has_workspace_role(v_ws, array['manager', 'tenant_admin'])) then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  select * into v_order from public.orders o
   where o.created_by = v_actor and o.client_request_id = p_client_request_id for update;

  if not found then
    insert into public.orders(ref, client_id, created_by, origin, destination, status,
                              workspace_id, client_company_id, client_request_id)
    values ('ZK-' || to_char(now(), 'YYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 5)),
            v_actor, v_actor, '', '', 'draft', v_ws, p_company_id, p_client_request_id)
    returning * into v_order;
  elsif v_order.client_company_id <> p_company_id then
    raise exception 'request belongs to another company' using errcode = '42501';
  end if;

  if v_order.status = 'draft' then
    perform public.apply_request_data(v_order.id, coalesce(p_data, '{}'::jsonb));
  end if;

  v_missing := public.request_missing_fields(v_order.id);
  if p_submit and v_order.status = 'draft' then
    if cardinality(v_missing) > 0 then
      raise exception 'missing required fields: %', array_to_string(v_missing, ',') using errcode = '23502';
    end if;
    perform set_config('exim.trusted', 'on', true);
    perform set_config('exim.request_submit', 'on', true);
    update public.orders o set status = 'new' where o.id = v_order.id;
    perform set_config('exim.request_submit', '', true);
    perform set_config('exim.trusted', '', true);
    -- the snapshot that goes to calculation is the submitted one
    update public.order_revisions r set data = (select public.order_request_data(o) from public.orders o where o.id = v_order.id)
     where r.order_id = v_order.id and r.revision = 1;
  end if;

  return query select o.id, o.ref, o.status, v_missing from public.orders o where o.id = v_order.id;
end
$function$;

-- A draft leaves draft only through save_request(..., submit => true).
create or replace function public.orders_draft_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if old.status = 'draft' and new.status is distinct from 'draft'
     and coalesce(current_setting('exim.request_submit', true), '') <> 'on' then
    raise exception 'submit the draft with save_request' using errcode = '42501';
  end if;
  return new;
end
$function$;
drop trigger if exists orders_draft_guard on public.orders;
create trigger orders_draft_guard before update of status on public.orders
  for each row execute function public.orders_draft_guard();

-- revise_order now accepts every REQ-001 field.
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
  v_before jsonb;
  v_after jsonb;
  v_missing_before text[];
  v_rev int;
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
  v_before := public.order_request_data(v_order);
  v_missing_before := public.request_missing_fields(p_order_id);
  perform public.apply_request_data(p_order_id, p_data);
  select public.order_request_data(o) into v_after from public.orders o where o.id = p_order_id;
  if v_after = v_before then
    return public.order_current_revision(p_order_id);
  end if;
  if exists (select 1 from unnest(public.request_missing_fields(p_order_id)) m
             where m <> all (v_missing_before)) then
    raise exception 'required request fields cannot be cleared' using errcode = '23502';
  end if;

  v_rev := public.order_current_revision(p_order_id) + 1;
  insert into public.order_revisions(order_id, workspace_id, revision, data, reason, changed_by)
  values (p_order_id, v_order.workspace_id, v_rev, v_after, p_reason, v_actor);
  update public.rate_quotes set status = 'withdrawn' where order_id = p_order_id and status = 'active';
  perform set_config('exim.trusted', 'on', true);
  update public.orders
     set status = case when v_order.logist_id is null then 'new' else 'assigned' end, calc_submitted_at = null
   where id = p_order_id;
  perform set_config('exim.trusted', '', true);
  return v_rev;
end
$function$;

revoke all on function public.save_request(uuid, uuid, jsonb, boolean) from public, anon;
grant execute on function public.save_request(uuid, uuid, jsonb, boolean) to authenticated;

-- Request fields are visible to everyone who may read the order (column grants from Wave 1b).
grant select (contact_name, contact_phone, ready_date, places, weight_kg, volume_m3, dimensions,
              packaging, stackable, loading_method, incoterms, hs_code, consignee, client_request_id)
  on public.orders to authenticated;
