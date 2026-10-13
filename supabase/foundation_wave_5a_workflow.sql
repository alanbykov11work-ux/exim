-- TASK-2026-001 Wave 5a (REQ-003, AC-TASK-012/013/016/017): versioned Gate workflow.
-- System templates QuoteRequest v1, Shipment v1 (exim.kz) and Trip v1 are seeded read-only.
-- Every object is pinned to the active version at creation; every stage change goes through
-- wf_transition(), which checks the pinned version, the actor role, the entitlement and the
-- required comment, and writes history with the actor's membership. TBD / Post-Gate transitions
-- are present in the definition but disabled. Legacy status columns are derived from the stage.
-- Depends on: foundation_wave_4c_shipment_workflow.sql.

-- =====================================================================
-- 1. Model
-- =====================================================================
create table if not exists public.workflow_templates (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,
  object_type text not null check (object_type in ('quote_request', 'shipment', 'trip')),
  scope       text not null default 'system' check (scope in ('system')),
  name        text not null
);

create table if not exists public.workflow_template_versions (
  id          uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.workflow_templates (id),
  version     int  not null check (version > 0),
  status      text not null default 'active' check (status in ('active', 'retired')),
  definition  jsonb not null,
  created_at  timestamptz not null default now(),
  unique (template_id, version)
);
create unique index if not exists workflow_one_active_version
  on public.workflow_template_versions (template_id) where status = 'active';

create table if not exists public.workflow_instances (
  id            uuid primary key default gen_random_uuid(),
  object_type   text not null check (object_type in ('quote_request', 'shipment', 'trip')),
  object_id     uuid not null,
  workspace_id  uuid not null references public.tenant_workspaces (id),
  version_id    uuid not null references public.workflow_template_versions (id),
  current_stage text not null,
  updated_at    timestamptz not null default now(),
  unique (object_type, object_id)
);

create table if not exists public.workflow_history (
  id            bigint generated always as identity primary key,
  instance_id   uuid not null references public.workflow_instances (id),
  workspace_id  uuid not null references public.tenant_workspaces (id),
  from_stage    text,
  to_stage      text not null,
  actor_id      uuid references auth.users (id),
  membership_id uuid references public.workspace_memberships (id),
  comment       text,
  created_at    timestamptz not null default now()
);

-- Versions are immutable; nothing in the workflow model is deleted.
create or replace function public.workflow_immutable()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  -- the only allowed change: the owner retires a version (auth.uid() is null outside the API)
  if tg_table_name = 'workflow_template_versions' and tg_op = 'UPDATE' and auth.uid() is null then
    if to_jsonb(old)->>'status' = 'active' and to_jsonb(new)->>'status' = 'retired'
       and (to_jsonb(new) - 'status') = (to_jsonb(old) - 'status') then
      return new;
    end if;
  end if;
  raise exception 'workflow templates and history are append-only' using errcode = '42501';
end
$function$;
drop trigger if exists workflow_versions_immutable on public.workflow_template_versions;
create trigger workflow_versions_immutable before update or delete on public.workflow_template_versions
  for each row execute function public.workflow_immutable();
drop trigger if exists workflow_history_immutable on public.workflow_history;
create trigger workflow_history_immutable before update or delete on public.workflow_history
  for each row execute function public.workflow_immutable();

alter table public.workflow_templates enable row level security;
alter table public.workflow_template_versions enable row level security;
alter table public.workflow_instances enable row level security;
alter table public.workflow_history enable row level security;

-- Read-only template list for any active workspace member (system scope).
drop policy if exists workflow_templates_read on public.workflow_templates;
create policy workflow_templates_read on public.workflow_templates for select to authenticated
  using (exists (select 1 from public.workspace_memberships m where m.user_id = auth.uid() and m.status = 'active'));
drop policy if exists workflow_versions_read on public.workflow_template_versions;
create policy workflow_versions_read on public.workflow_template_versions for select to authenticated
  using (exists (select 1 from public.workspace_memberships m where m.user_id = auth.uid() and m.status = 'active'));
-- Instances and history are staff-only; clients get client labels through workflow_stages().
drop policy if exists workflow_instances_staff on public.workflow_instances;
create policy workflow_instances_staff on public.workflow_instances for select to authenticated
  using (public.has_workspace_role(workspace_id, array['manager', 'logistician', 'tenant_admin']));
drop policy if exists workflow_history_staff on public.workflow_history;
create policy workflow_history_staff on public.workflow_history for select to authenticated
  using (public.has_workspace_role(workspace_id, array['manager', 'logistician', 'tenant_admin']));

revoke all on public.workflow_templates, public.workflow_template_versions,
              public.workflow_instances, public.workflow_history from anon, authenticated;
grant select on public.workflow_templates, public.workflow_template_versions,
                public.workflow_instances, public.workflow_history to authenticated;

-- =====================================================================
-- 2. Seed: system templates v1 (Product OS REQ-003 / lifecycles)
-- =====================================================================
insert into public.workflow_templates (code, object_type, name) values
  ('quote_request_v1', 'quote_request', 'QuoteRequest workflow'),
  ('shipment_exim_v1', 'shipment', 'Shipment workflow exim.kz'),
  ('trip_v1', 'trip', 'Trip workflow')
on conflict (code) do nothing;

insert into public.workflow_template_versions (template_id, version, definition)
select t.id, 1, d.def
from public.workflow_templates t
join (values
 ('quote_request_v1', $json${
  "initial": "draft",
  "stages": {
    "draft": {"client": "Черновик"},
    "manager_review": {"client": "Проверяем заявку"},
    "data_required": {"client": "Нужно уточнение"},
    "sent_to_logistician": {"client": "Выполняется расчёт"},
    "rate_search": {"client": "Выполняется расчёт"},
    "rate_received": {"client": "Готовим предложение"},
    "offer_preparation": {"client": "Готовим предложение"},
    "offer_to_client": {"client": "Предложение готово"},
    "clarification_requested": {"client": "Уточняем предложение"},
    "approved": {"client": "Предложение согласовано"},
    "rejected": {"client": "Предложение отклонено"},
    "contract_pending": {"client": "Оформляем документы"},
    "contract_signed": {"client": "Документы оформлены"},
    "converted_to_shipment": {"client": "Создана перевозка"},
    "closed": {"client": "Создана перевозка"},
    "closed_without_rate": {"client": "Расчёт завершён без предложения"},
    "recalculation": {"client": "Выполняется расчёт"},
    "cancelled": {"client": "Отменена"}
  },
  "transitions": [
    {"from": "draft", "to": "manager_review", "roles": ["client", "manager"], "enabled": true},
    {"from": "manager_review", "to": "data_required", "roles": ["manager"], "enabled": true, "comment": true},
    {"from": "data_required", "to": "manager_review", "roles": ["client", "manager"], "enabled": true},
    {"from": "manager_review", "to": "sent_to_logistician", "roles": ["manager"], "enabled": true},
    {"from": "sent_to_logistician", "to": "data_required", "roles": ["logistician"], "enabled": true, "comment": true},
    {"from": "sent_to_logistician", "to": "rate_search", "roles": ["logistician"], "enabled": true},
    {"from": "rate_search", "to": "rate_received", "roles": ["logistician"], "enabled": true},
    {"from": "rate_received", "to": "offer_preparation", "roles": ["manager"], "enabled": true},
    {"from": "offer_preparation", "to": "offer_to_client", "roles": ["manager"], "enabled": true},
    {"from": "offer_to_client", "to": "clarification_requested", "roles": ["client"], "enabled": true, "comment": true},
    {"from": "clarification_requested", "to": "offer_to_client", "roles": ["manager"], "enabled": true},
    {"from": "offer_to_client", "to": "approved", "roles": ["client"], "enabled": true},
    {"from": "offer_to_client", "to": "rejected", "roles": ["client"], "enabled": true, "comment": true},
    {"from": "approved", "to": "contract_pending", "roles": ["manager"], "enabled": true},
    {"from": "contract_pending", "to": "contract_signed", "roles": ["manager"], "enabled": true},
    {"from": "contract_signed", "to": "converted_to_shipment", "roles": ["manager"], "enabled": true},
    {"from": "converted_to_shipment", "to": "closed", "roles": ["system"], "enabled": true},
    {"from": "rate_search", "to": "closed_without_rate", "roles": ["manager"], "enabled": true, "comment": true},
    {"from": "sent_to_logistician", "to": "closed_without_rate", "roles": ["manager"], "enabled": true, "comment": true},
    {"from": "rate_received", "to": "recalculation", "roles": [], "enabled": false, "note": "TBD: actor not approved"},
    {"from": "recalculation", "to": "rate_received", "roles": [], "enabled": false, "note": "TBD: actor not approved"},
    {"from": "*", "to": "cancelled", "roles": [], "enabled": false, "note": "TBD"}
  ]}$json$::jsonb),
 ('shipment_exim_v1', $json${
  "initial": "preparation",
  "stages": {
    "preparation": {"client": "Готовим перевозку"},
    "factory_contact": {"client": "Уточняем готовность груза"},
    "pickup_waiting": {"client": "Ожидаем забор груза"},
    "loading": {"client": "Идёт погрузка"},
    "in_transit": {"client": "Груз в пути"},
    "border_or_customs": {"client": "Проходит обязательные процедуры"},
    "final_delivery": {"client": "Доставка к месту назначения"},
    "delivered": {"client": "Груз доставлен"},
    "documents_closing": {"client": "Завершаем документы"},
    "closed": {"client": "Перевозка завершена"}
  },
  "transitions": [
    {"from": "preparation", "to": "factory_contact", "roles": ["logistician"], "enabled": true, "comment": true},
    {"from": "factory_contact", "to": "pickup_waiting", "roles": ["logistician"], "enabled": true, "comment": true},
    {"from": "pickup_waiting", "to": "loading", "roles": ["logistician"], "enabled": true, "when_where": true},
    {"from": "loading", "to": "in_transit", "roles": ["logistician"], "enabled": true, "when_where": true},
    {"from": "in_transit", "to": "border_or_customs", "roles": [], "enabled": false, "note": "Post-Gate"},
    {"from": "border_or_customs", "to": "final_delivery", "roles": [], "enabled": false, "note": "Post-Gate"},
    {"from": "final_delivery", "to": "delivered", "roles": [], "enabled": false, "note": "Post-Gate"},
    {"from": "delivered", "to": "documents_closing", "roles": [], "enabled": false, "note": "TBD"},
    {"from": "documents_closing", "to": "closed", "roles": [], "enabled": false, "note": "TBD"}
  ]}$json$::jsonb),
 ('trip_v1', $json${
  "initial": "preparation",
  "stages": {
    "preparation": {"client": "Готовим рейс"},
    "transport_assigned": {"client": "Транспорт назначен"},
    "loading": {"client": "Идёт погрузка"},
    "in_transit": {"client": "Груз в пути"},
    "customs_if_applicable": {"client": "Проходит обязательные процедуры"},
    "delivery": {"client": "Доставка к месту назначения"},
    "closed": {"client": "Рейс завершён"}
  },
  "transitions": [
    {"from": "preparation", "to": "transport_assigned", "roles": ["logistician"], "enabled": true},
    {"from": "transport_assigned", "to": "loading", "roles": ["logistician"], "enabled": true, "when_where": true},
    {"from": "loading", "to": "in_transit", "roles": ["logistician"], "enabled": true, "when_where": true},
    {"from": "in_transit", "to": "customs_if_applicable", "roles": [], "enabled": false, "note": "TBD"},
    {"from": "in_transit", "to": "delivery", "roles": [], "enabled": false, "note": "TBD"},
    {"from": "customs_if_applicable", "to": "delivery", "roles": [], "enabled": false, "note": "TBD"},
    {"from": "delivery", "to": "closed", "roles": [], "enabled": false, "note": "TBD"}
  ]}$json$::jsonb)
) as d(code, def) on d.code = t.code
where not exists (select 1 from public.workflow_template_versions v where v.template_id = t.id);

-- =====================================================================
-- 3. Engine
-- =====================================================================
-- Trip stages follow Trip workflow v1.
do $do$
begin
  perform set_config('exim.trip_write', 'on', true);
  alter table public.trips drop constraint if exists trips_trip_stage_check;
  update public.trips set trip_stage = 'preparation' where trip_stage = 'planned';
  alter table public.trips alter column trip_stage set default 'preparation';
  alter table public.trips add constraint trips_trip_stage_check
    check (trip_stage in ('preparation', 'transport_assigned', 'loading', 'in_transit'));
  perform set_config('exim.trip_write', '', true);
end
$do$;

create or replace function public.wf_order_status(p_stage text)
returns text
language sql
immutable
set search_path = ''
as $function$
  select case p_stage
    when 'draft' then 'draft' when 'manager_review' then 'new' when 'data_required' then 'clarification'
    when 'sent_to_logistician' then 'assigned' when 'rate_search' then 'assigned'
    when 'rate_received' then 'calculated' when 'offer_preparation' then 'calculated'
    when 'offer_to_client' then 'offer_sent' when 'clarification_requested' then 'calculated'
    when 'approved' then 'approved' when 'rejected' then 'rejected' when 'contract_pending' then 'approved'
    when 'contract_signed' then 'contract_signed' when 'converted_to_shipment' then 'converted'
    when 'closed' then 'converted' when 'closed_without_rate' then 'archived' end
$function$;

-- Stage of an object that existed before the workflow was introduced.
create or replace function public.wf_legacy_stage(p_type text, p_object_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $function$
  select case p_type
    when 'quote_request' then (select case o.status
        when 'draft' then 'draft' when 'new' then 'manager_review' when 'clarification' then 'data_required'
        when 'assigned' then 'rate_search' when 'calculated' then 'rate_received' when 'offer_sent' then 'offer_to_client'
        when 'approved' then 'approved' when 'rejected' then 'rejected' when 'contract_signed' then 'contract_signed'
        else 'closed' end from public.orders o where o.id = p_object_id)
    when 'shipment' then (select t.stage from public.transports t where t.id = p_object_id)
    when 'trip' then (select r.trip_stage from public.trips r where r.id = p_object_id)
  end
$function$;

create or replace function public.wf_object_workspace(p_type text, p_object_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $function$
  select case p_type
    when 'quote_request' then (select o.workspace_id from public.orders o where o.id = p_object_id)
    when 'shipment' then (select t.workspace_id from public.transports t where t.id = p_object_id)
    when 'trip' then (select t.workspace_id from public.trips r join public.transports t on t.id = r.transport_id where r.id = p_object_id)
  end
$function$;

-- Pins an object to the active version of its template (once; never switched later).
create or replace function public.wf_ensure(p_type text, p_object_id uuid)
returns public.workflow_instances
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_inst public.workflow_instances%rowtype;
  v_ws uuid;
  v_version uuid;
  v_stage text;
begin
  select * into v_inst from public.workflow_instances i where i.object_type = p_type and i.object_id = p_object_id;
  if found then return v_inst; end if;
  v_ws := public.wf_object_workspace(p_type, p_object_id);
  if v_ws is null then
    raise exception 'object is not scoped to a workspace' using errcode = '42501';
  end if;
  select v.id into v_version from public.workflow_template_versions v
    join public.workflow_templates t on t.id = v.template_id
   where t.object_type = p_type and v.status = 'active';
  v_stage := public.wf_legacy_stage(p_type, p_object_id);
  insert into public.workflow_instances(object_type, object_id, workspace_id, version_id, current_stage)
  values (p_type, p_object_id, v_ws, v_version, v_stage)
  on conflict (object_type, object_id) do nothing
  returning * into v_inst;
  if v_inst.id is null then
    select * into v_inst from public.workflow_instances i where i.object_type = p_type and i.object_id = p_object_id;
  else
    insert into public.workflow_history(instance_id, workspace_id, from_stage, to_stage, actor_id, membership_id, comment)
    values (v_inst.id, v_ws, null, v_stage, auth.uid(),
            (select m.id from public.workspace_memberships m where m.workspace_id = v_ws and m.user_id = auth.uid() and m.status = 'active' limit 1),
            'instance created');
  end if;
  return v_inst;
end
$function$;

create or replace function public.wf_on_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if tg_table_name = 'orders' and new.workspace_id is not null then
    perform public.wf_ensure('quote_request', new.id);
  elsif tg_table_name = 'transports' and new.workspace_id is not null then
    perform public.wf_ensure('shipment', new.id);
  elsif tg_table_name = 'trips' and public.wf_object_workspace('trip', new.id) is not null then
    perform public.wf_ensure('trip', new.id);
  end if;
  return null;
end
$function$;
drop trigger if exists wf_on_insert on public.orders;
create trigger wf_on_insert after insert on public.orders for each row execute function public.wf_on_insert();
drop trigger if exists wf_on_insert on public.transports;
create trigger wf_on_insert after insert on public.transports for each row execute function public.wf_on_insert();
drop trigger if exists wf_on_insert on public.trips;
create trigger wf_on_insert after insert on public.trips for each row execute function public.wf_on_insert();

-- The only way to change a stage.
create or replace function public.wf_transition(p_type text, p_object_id uuid, p_to text, p_comment text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_inst public.workflow_instances%rowtype;
  v_def jsonb;
  v_tr jsonb;
  v_ok boolean := false;
  v_role text;
  v_company uuid;
  v_actor text := coalesce(current_setting('request.jwt.claim.sub', true), '');
begin
  v_inst := public.wf_ensure(p_type, p_object_id);
  select v.definition into v_def from public.workflow_template_versions v where v.id = v_inst.version_id;
  select t into v_tr from jsonb_array_elements(v_def->'transitions') t
   where t->>'from' = v_inst.current_stage and t->>'to' = p_to;
  if v_tr is null or not coalesce((v_tr->>'enabled')::boolean, false) then
    raise exception 'transition % -> % is not allowed by % v%', v_inst.current_stage, p_to, p_type,
      (select v.version from public.workflow_template_versions v where v.id = v_inst.version_id) using errcode = '22023';
  end if;
  if not public.has_module_entitlement(v_inst.workspace_id, 'private_os') then
    raise exception 'module is disabled for this workspace' using errcode = '42501';
  end if;
  if p_type = 'quote_request' then
    select o.client_company_id into v_company from public.orders o where o.id = p_object_id;
  end if;
  for v_role in select jsonb_array_elements_text(v_tr->'roles') loop
    v_ok := v_ok or case v_role
      when 'system' then coalesce(current_setting('exim.wf_system', true), '') = 'on'
      when 'client' then v_company is not null and public.is_client_of_company(v_inst.workspace_id, v_company)
      when 'manager' then public.has_workspace_role(v_inst.workspace_id, array['manager'])
      when 'logistician' then public.has_workspace_role(v_inst.workspace_id, array['logistician'])
      else false end;
  end loop;
  if not v_ok then
    raise exception 'role is not allowed to move % to %', p_type, p_to using errcode = '42501';
  end if;
  if coalesce((v_tr->>'comment')::boolean, false) and length(btrim(coalesce(p_comment, ''))) < 3 then
    raise exception 'a comment is required for % -> %', v_inst.current_stage, p_to using errcode = '23502';
  end if;

  insert into public.workflow_history(instance_id, workspace_id, from_stage, to_stage, actor_id, membership_id, comment)
  values (v_inst.id, v_inst.workspace_id, v_inst.current_stage, p_to, auth.uid(),
          (select m.id from public.workspace_memberships m
            where m.workspace_id = v_inst.workspace_id and m.user_id = auth.uid() and m.status = 'active' limit 1),
          nullif(btrim(p_comment), ''));
  update public.workflow_instances set current_stage = p_to, updated_at = now() where id = v_inst.id;

  -- derived legacy columns, written once under every guard bypass
  perform set_config('exim.wf', 'on', true);
  perform set_config('exim.offer_flow', 'on', true);
  perform set_config('exim.request_submit', 'on', true);
  perform set_config('exim.shipment_create', 'on', true);
  perform set_config('exim.shipment_stage', 'on', true);
  perform set_config('exim.trip_write', 'on', true);
  perform set_config('request.jwt.claim.sub', '', true);
  if p_type = 'quote_request' then
    update public.orders set status = public.wf_order_status(p_to) where id = p_object_id
      and status is distinct from public.wf_order_status(p_to);
  elsif p_type = 'shipment' then
    update public.transports set stage = p_to where id = p_object_id;
  else
    update public.trips set trip_stage = p_to where id = p_object_id;
  end if;
  perform set_config('request.jwt.claim.sub', v_actor, true);
  perform set_config('exim.wf', '', true);
  perform set_config('exim.offer_flow', '', true);
  perform set_config('exim.request_submit', '', true);
  perform set_config('exim.shipment_create', '', true);
  perform set_config('exim.shipment_stage', '', true);
  perform set_config('exim.trip_write', '', true);
end
$function$;

create or replace function public.wf_stage(p_type text, p_object_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $function$
  select coalesce((select i.current_stage from public.workflow_instances i where i.object_type = p_type and i.object_id = p_object_id),
                  public.wf_legacy_stage(p_type, p_object_id))
$function$;

-- Scoped order status can no longer be written directly.
create or replace function public.orders_wf_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if old.workspace_id is not null and new.status is distinct from old.status
     and coalesce(current_setting('exim.wf', true), '') <> 'on' then
    raise exception 'order stage changes only through workflow actions' using errcode = '42501';
  end if;
  return new;
end
$function$;
drop trigger if exists orders_wf_guard on public.orders;
create trigger orders_wf_guard before update of status on public.orders
  for each row execute function public.orders_wf_guard();

-- Stage and client label for a list of objects. Clients receive only the client label.
create or replace function public.workflow_stages(p_type text, p_ids uuid[])
returns table (object_id uuid, stage text, client_label text, version int)
language sql
stable
security definer
set search_path = ''
as $function$
  with obj as (
    select x.id,
      case p_type when 'quote_request' then public.can_read_order(x.id)
                  when 'shipment' then public.can_read_transport(x.id)
                  when 'trip' then exists (select 1 from public.trips r where r.id = x.id and public.can_read_transport(r.transport_id)) end as readable,
      public.wf_object_workspace(p_type, x.id) as ws
    from unnest(p_ids) as x(id)
  )
  select obj.id,
         case when public.has_workspace_role(obj.ws, array['manager', 'logistician', 'tenant_admin'])
              then public.wf_stage(p_type, obj.id) end,
         coalesce(v.definition->'stages'->public.wf_stage(p_type, obj.id)->>'client', ''),
         case when public.has_workspace_role(obj.ws, array['manager', 'logistician', 'tenant_admin']) then v.version end
  from obj
  left join public.workflow_instances i on i.object_type = p_type and i.object_id = obj.id
  left join public.workflow_template_versions v on v.id = coalesce(i.version_id,
    (select vv.id from public.workflow_template_versions vv join public.workflow_templates t on t.id = vv.template_id
      where t.object_type = p_type and vv.status = 'active'))
  where obj.readable
$function$;

revoke all on function public.wf_order_status(text) from public, anon, authenticated;
revoke all on function public.wf_legacy_stage(text, uuid) from public, anon, authenticated;
revoke all on function public.wf_object_workspace(text, uuid) from public, anon, authenticated;
revoke all on function public.wf_ensure(text, uuid) from public, anon, authenticated;
revoke all on function public.wf_transition(text, uuid, text, text) from public, anon, authenticated;
revoke all on function public.wf_stage(text, uuid) from public, anon, authenticated;
revoke all on function public.workflow_stages(text, uuid[]) from public, anon;
grant execute on function public.workflow_stages(text, uuid[]) to authenticated;

-- =====================================================================
-- 4. QuoteRequest actions on top of the engine
-- =====================================================================
-- helper to patch an existing function body and fail loudly if the anchor is gone
create or replace function public.wf_patch_function(p_sig text, p_from text, p_to text)
returns void
language plpgsql
set search_path = ''
as $function$
declare v_src text;
begin
  select pg_get_functiondef(p_sig::regprocedure) into v_src;
  if position(p_from in v_src) = 0 then
    raise exception 'patch anchor not found in %', p_sig;
  end if;
  execute replace(v_src, p_from, p_to);
end
$function$;

-- draft -> manager_review on submit
select public.wf_patch_function('public.save_request(uuid, uuid, jsonb, boolean)',
$$    perform set_config('request.jwt.claim.sub', '', true);
    perform set_config('exim.request_submit', 'on', true);
    update public.orders o set status = 'new' where o.id = v_order.id;
    perform set_config('exim.request_submit', '', true);
    perform set_config('request.jwt.claim.sub', v_actor::text, true);$$,
$$    perform public.wf_transition('quote_request', v_order.id, 'manager_review', null);$$);

-- manager_review -> data_required (manager)
create or replace function public.return_for_clarification(p_order_id uuid, p_message text)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare v_ws uuid;
begin
  select o.workspace_id into v_ws from public.orders o where o.id = p_order_id for update;
  perform public.wf_transition('quote_request', p_order_id, 'data_required', p_message);
  insert into public.order_clarifications(order_id, workspace_id, direction, message, author_id)
  values (p_order_id, v_ws, 'to_client', p_message, auth.uid());
end
$function$;

-- sent_to_logistician -> data_required (assigned logistician)
create or replace function public.logist_request_data(p_order_id uuid, p_message text)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare v_order public.orders%rowtype;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if v_order.logist_id is distinct from auth.uid() then
    raise exception 'only the assigned logistician' using errcode = '42501';
  end if;
  perform public.wf_transition('quote_request', p_order_id, 'data_required', p_message);
  insert into public.order_clarifications(order_id, workspace_id, direction, message, author_id)
  values (p_order_id, v_order.workspace_id, 'to_client', p_message, auth.uid());
end
$function$;

-- data_required -> manager_review (client or manager), answer without editing fields
create or replace function public.answer_clarification(p_order_id uuid, p_message text)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare v_ws uuid;
begin
  select o.workspace_id into v_ws from public.orders o where o.id = p_order_id for update;
  if length(btrim(coalesce(p_message, ''))) < 3 then
    raise exception 'answer is required' using errcode = '23502';
  end if;
  perform public.wf_transition('quote_request', p_order_id, 'manager_review', p_message);
  insert into public.order_clarifications(order_id, workspace_id, direction, message, author_id)
  values (p_order_id, v_ws, 'to_manager', p_message, auth.uid());
end
$function$;

-- Request fields change in manager_review (no stage change) or in data_required (-> manager_review).
-- Recalculation after rates is TBD in the Gate and is not allowed.
create or replace function public.revise_order(p_order_id uuid, p_data jsonb, p_reason text default null)
returns int
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_order public.orders%rowtype;
  v_actor uuid := auth.uid();
  v_stage text;
  v_before jsonb;
  v_after jsonb;
  v_missing_before text[];
  v_rev int;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if not found or v_order.workspace_id is null
     or not (public.has_workspace_role(v_order.workspace_id, array['manager'])
             or public.is_client_of_company(v_order.workspace_id, v_order.client_company_id)) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  v_stage := public.wf_stage('quote_request', p_order_id);
  if v_stage not in ('manager_review', 'data_required') then
    raise exception 'request cannot be changed at stage %', v_stage using errcode = '22023';
  end if;
  v_before := public.order_request_data(v_order);
  v_missing_before := public.request_missing_fields(p_order_id);
  perform public.apply_request_data(p_order_id, p_data);
  select public.order_request_data(o) into v_after from public.orders o where o.id = p_order_id;
  if v_after = v_before then
    return public.order_current_revision(p_order_id);
  end if;
  if exists (select 1 from unnest(public.request_missing_fields(p_order_id)) m where m <> all (v_missing_before)) then
    raise exception 'required request fields cannot be cleared' using errcode = '23502';
  end if;
  v_rev := public.order_current_revision(p_order_id) + 1;
  insert into public.order_revisions(order_id, workspace_id, revision, data, reason, changed_by)
  values (p_order_id, v_order.workspace_id, v_rev, v_after, p_reason, v_actor);
  if v_stage = 'data_required' then
    perform public.wf_transition('quote_request', p_order_id, 'manager_review', coalesce(p_reason, 'данные уточнены'));
  end if;
  return v_rev;
end
$function$;

-- manager_review -> sent_to_logistician (manager): logistician, route, cargo, weight, volume
create or replace function public.assign_logist(p_order_id uuid, p_logist uuid, p_deadline timestamptz default null)
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
  if not found or v_order.workspace_id is null then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if not exists (select 1 from public.workspace_memberships m where m.workspace_id = v_order.workspace_id
                  and m.user_id = p_logist and m.role = 'logistician' and m.status = 'active') then
    raise exception 'logistician must be an active logistician of the workspace' using errcode = '22023';
  end if;
  if cardinality(public.request_missing_fields(p_order_id)) > 0 then
    raise exception 'route, cargo, weight and volume are required' using errcode = '23502';
  end if;
  perform public.wf_transition('quote_request', p_order_id, 'sent_to_logistician', null);
  perform set_config('request.jwt.claim.sub', '', true);
  update public.orders set logist_id = p_logist, calc_deadline = p_deadline where id = p_order_id;
  perform set_config('request.jwt.claim.sub', v_actor, true);
end
$function$;

-- sent_to_logistician -> rate_search (assigned logistician): data accepted as sufficient
create or replace function public.logist_accept(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if (select o.logist_id from public.orders o where o.id = p_order_id) is distinct from auth.uid() then
    raise exception 'only the assigned logistician' using errcode = '42501';
  end if;
  perform public.wf_transition('quote_request', p_order_id, 'rate_search', null);
end
$function$;

-- RateQuote: separate object inside rate_search; carries everything Gate requires.
alter table public.rate_quotes
  add column if not exists quote_date     date not null default current_date,
  add column if not exists transit_days   int check (transit_days is null or transit_days > 0),
  add column if not exists availability   text check (availability is null or length(availability) <= 200),
  add column if not exists route          text check (route is null or length(route) <= 500),
  add column if not exists transport_mode text check (transport_mode is null or transport_mode in ('road','rail','sea','air','multimodal')),
  add column if not exists source         text check (source is null or length(source) <= 200);
grant insert (quote_date, transit_days, availability, route, transport_mode, source) on public.rate_quotes to authenticated;

create or replace function public.rate_is_valid(r public.rate_quotes)
returns boolean
language sql
immutable
set search_path = ''
as $function$
  select r.status = 'active' and r.amount > 0 and r.currency is not null and r.quote_date is not null
     and r.transit_days is not null and r.valid_until is not null and r.valid_until >= r.quote_date
     and length(btrim(coalesce(r.availability, ''))) > 0 and length(btrim(coalesce(r.route, ''))) > 0
     and r.transport_mode is not null and length(btrim(coalesce(r.source, ''))) > 0
     and length(btrim(coalesce(r.comment, ''))) > 0
$function$;

create or replace function public.rate_quotes_stage_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if public.wf_stage('quote_request', new.order_id) <> 'rate_search' then
    raise exception 'rates are added only at stage rate_search' using errcode = '22023';
  end if;
  if (select o.logist_id from public.orders o where o.id = new.order_id) is distinct from auth.uid() then
    raise exception 'only the assigned logistician adds rates' using errcode = '42501';
  end if;
  return new;
end
$function$;
drop trigger if exists rate_quotes_stage_guard on public.rate_quotes;
create trigger rate_quotes_stage_guard before insert on public.rate_quotes
  for each row execute function public.rate_quotes_stage_guard();

-- rate_search -> rate_received (assigned logistician) only with two valid rates
create or replace function public.complete_rate_search(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if (select o.logist_id from public.orders o where o.id = p_order_id) is distinct from auth.uid() then
    raise exception 'only the assigned logistician' using errcode = '42501';
  end if;
  if (select count(*) from public.rate_quotes r where r.order_id = p_order_id and public.rate_is_valid(r)) < 2 then
    raise exception 'at least two valid rates are required' using errcode = '23514';
  end if;
  perform public.wf_transition('quote_request', p_order_id, 'rate_received', null);
  update public.orders set calc_submitted_at = now() where id = p_order_id;
end
$function$;

-- rate_search | sent_to_logistician -> closed_without_rate (manager, reason)
create or replace function public.close_without_rate(p_order_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
begin
  perform public.wf_transition('quote_request', p_order_id, 'closed_without_rate', p_reason);
end
$function$;

-- rate_received -> offer_preparation (manager) with audited choice; re-choice inside offer_preparation
create or replace function public.select_rate(p_order_id uuid, p_rate_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_order public.orders%rowtype;
  v_stage text;
  v_actor text := coalesce(current_setting('request.jwt.claim.sub', true), '');
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if not found or not public.has_workspace_role(v_order.workspace_id, array['manager']) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  v_stage := public.wf_stage('quote_request', p_order_id);
  if v_stage not in ('rate_received', 'offer_preparation') then
    raise exception 'rate cannot be selected at stage %', v_stage using errcode = '22023';
  end if;
  if not exists (select 1 from public.rate_quotes r where r.id = p_rate_id and r.order_id = p_order_id and public.rate_is_valid(r)) then
    raise exception 'rate is not a valid rate of this order' using errcode = '22023';
  end if;
  if v_stage = 'rate_received' then
    perform public.wf_transition('quote_request', p_order_id, 'offer_preparation', null);
  end if;
  perform set_config('request.jwt.claim.sub', '', true);
  update public.orders set selected_rate_id = p_rate_id where id = p_order_id;
  perform set_config('request.jwt.claim.sub', v_actor, true);
  insert into public.tenant_audit_events(workspace_id, actor_user_id, action, object_type, object_id, before_state, after_state)
  values (v_order.workspace_id, auth.uid(), 'order.rate_selected', 'order', p_order_id::text,
          jsonb_build_object('rate_id', v_order.selected_rate_id), jsonb_build_object('rate_id', p_rate_id));
end
$function$;

-- offer_preparation | clarification_requested -> offer_to_client (manager), new offer version
drop function if exists public.send_offer(uuid, numeric, text, text, date, text);
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
  v_actor text := coalesce(current_setting('request.jwt.claim.sub', true), '');
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if not found or not public.has_workspace_role(v_order.workspace_id, array['manager']) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if v_order.selected_rate_id is null then
    raise exception 'select a rate first' using errcode = '23502';
  end if;
  if p_total is null or p_total <= 0 then
    raise exception 'final price is required' using errcode = '23502';
  end if;
  select * into v_prev from public.commercial_offers c where c.order_id = p_order_id order by c.version desc limit 1;
  if v_prev.id is not null and v_prev.total_price <> p_total and length(btrim(coalesce(p_price_reason, ''))) < 3 then
    raise exception 'price change requires a reason' using errcode = '23502';
  end if;
  perform public.wf_transition('quote_request', p_order_id, 'offer_to_client', p_comment);
  update public.commercial_offers set status = 'superseded' where order_id = p_order_id and status = 'sent';
  v_version := coalesce(v_prev.version, 0) + 1;
  insert into public.commercial_offers(order_id, workspace_id, version, total_price, currency, comment,
                                       valid_until, created_by, price_reason, previous_price)
  values (p_order_id, v_order.workspace_id, v_version, p_total, upper(coalesce(p_currency, 'KZT')), p_comment,
          p_valid_until, auth.uid(), nullif(btrim(p_price_reason), ''), v_prev.total_price)
  returning id into v_id;
  perform set_config('request.jwt.claim.sub', '', true);
  update public.orders set total_price = p_total, offer_comment = p_comment, offer_sent_at = now(),
         client_decision = null, client_decision_at = null where id = p_order_id;
  perform set_config('request.jwt.claim.sub', v_actor, true);
  return query select v_id, v_version;
end
$function$;

-- offer_to_client -> clarification_requested (client, exact version)
create or replace function public.request_offer_clarification(p_offer_id uuid, p_message text)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare v_offer public.commercial_offers%rowtype;
begin
  select * into v_offer from public.commercial_offers where id = p_offer_id for update;
  if not found or v_offer.status <> 'sent' then
    raise exception 'offer version is no longer open' using errcode = '22023';
  end if;
  perform public.wf_transition('quote_request', v_offer.order_id, 'clarification_requested', p_message);
  insert into public.order_clarifications(order_id, workspace_id, direction, offer_id, message, author_id)
  values (v_offer.order_id, v_offer.workspace_id, 'to_manager', p_offer_id, p_message, auth.uid());
  update public.commercial_offers set status = 'clarification', decided_by = auth.uid(), decided_at = now()
   where id = p_offer_id;
end
$function$;

-- offer_to_client -> approved / rejected (client, exact version; rejection needs a reason)
create or replace function public.decide_offer(p_offer_id uuid, p_decision text, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_offer public.commercial_offers%rowtype;
  v_actor text := coalesce(current_setting('request.jwt.claim.sub', true), '');
begin
  if p_decision not in ('approved', 'rejected') then
    raise exception 'decision must be approved or rejected' using errcode = '22023';
  end if;
  select * into v_offer from public.commercial_offers where id = p_offer_id for update;
  if not found then
    raise exception 'offer not found' using errcode = '42501';
  end if;
  if v_offer.status <> 'sent' then
    raise exception 'offer version % is no longer open', v_offer.version using errcode = '22023';
  end if;
  perform public.wf_transition('quote_request', v_offer.order_id, p_decision, p_reason);
  update public.commercial_offers set status = p_decision, decided_by = auth.uid(), decided_at = now() where id = p_offer_id;
  perform set_config('request.jwt.claim.sub', '', true);
  update public.orders set client_decision = p_decision, client_decision_at = now() where id = v_offer.order_id;
  perform set_config('request.jwt.claim.sub', v_actor, true);
end
$function$;
create or replace function public.decide_offer(p_offer_id uuid, p_decision text)
returns void
language sql
security invoker
set search_path = ''
as $function$ select public.decide_offer(p_offer_id, p_decision, null) $function$;

-- approved -> contract_pending -> contract_signed (manager): type, number/link, date
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
  if not found or not public.has_workspace_role(v_order.workspace_id, array['manager']) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select a.id into v_id from public.agreement_bases a where a.order_id = p_order_id;
  if v_id is not null then return v_id; end if;
  if p_kind is null or p_kind not in ('contract', 'addendum', 'signed_offer', 'invoice_paid') then
    raise exception 'agreement type is required' using errcode = '23502';
  end if;
  if length(btrim(coalesce(p_doc_number, ''))) = 0 then
    raise exception 'document number or confirmed link is required' using errcode = '23502';
  end if;
  if p_signed_on is null or p_signed_on > current_date then
    raise exception 'signing date is required and cannot be in the future' using errcode = '22023';
  end if;
  select c.id into v_offer from public.commercial_offers c where c.order_id = p_order_id and c.status = 'approved';
  perform public.wf_transition('quote_request', p_order_id, 'contract_pending', 'основание: ' || p_kind);
  insert into public.agreement_bases(order_id, offer_id, workspace_id, kind, doc_number, signed_on, comment, created_by)
  values (p_order_id, v_offer, v_order.workspace_id, p_kind, btrim(p_doc_number), p_signed_on, nullif(btrim(p_comment), ''), auth.uid())
  returning id into v_id;
  perform public.wf_transition('quote_request', p_order_id, 'contract_signed', 'документ ' || btrim(p_doc_number));
  perform set_config('request.jwt.claim.sub', '', true);
  update public.orders set contract_signed_at = now() where id = p_order_id;
  perform set_config('request.jwt.claim.sub', v_actor, true);
  insert into public.tenant_audit_events(workspace_id, actor_user_id, action, object_type, object_id, after_state)
  values (v_order.workspace_id, auth.uid(), 'order.agreement_recorded', 'order', p_order_id::text,
          jsonb_build_object('agreement_id', v_id, 'offer_id', v_offer, 'kind', p_kind));
  return v_id;
end
$function$;

-- contract_signed -> converted_to_shipment -> closed: exactly one Shipment
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
  if not found or not public.has_workspace_role(v_order.workspace_id, array['manager']) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select t.id, t.ref into v_id, v_ref from public.transports t where t.order_id = p_order_id;
  if v_id is not null then
    return query select v_id, v_ref, false;
    return;
  end if;
  select * into v_agr from public.agreement_bases a where a.order_id = p_order_id;
  if v_agr.id is null or v_order.selected_rate_id is null or v_order.logist_id is null then
    raise exception 'shipment requires an agreement basis, a selected rate and a logistician' using errcode = '22023';
  end if;
  perform public.wf_transition('quote_request', p_order_id, 'converted_to_shipment', null);
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
  perform set_config('exim.shipment_create', '', true);
  perform set_config('exim.wf_system', 'on', true);
  perform public.wf_transition('quote_request', p_order_id, 'closed', 'shipment ' || v_ref);
  perform set_config('exim.wf_system', '', true);
  insert into public.tenant_audit_events(workspace_id, actor_user_id, action, object_type, object_id, after_state)
  values (v_order.workspace_id, v_actor, 'shipment.created', 'transport', v_id::text,
          jsonb_build_object('order_id', p_order_id, 'agreement_id', v_agr.id, 'offer_id', v_agr.offer_id,
                             'rate_id', v_order.selected_rate_id));
  return query select v_id, v_ref, true;
end
$function$;

-- =====================================================================
-- 5. Shipment and Trip actions on top of the engine
-- =====================================================================
alter table public.shipment_stage_history
  add column if not exists occurred_at timestamptz,
  add column if not exists location text check (location is null or length(location) <= 300);

drop function if exists public.advance_shipment(uuid, text, text);
create or replace function public.advance_shipment(
  p_transport_id uuid, p_to_stage text, p_note text default null,
  p_occurred_at timestamptz default null, p_location text default null)
returns text
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_t public.transports%rowtype;
begin
  select * into v_t from public.transports where id = p_transport_id for update;
  if not found or v_t.workspace_id is null then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if v_t.logist_id is distinct from auth.uid() then
    raise exception 'only the assigned logistician moves the shipment' using errcode = '42501';
  end if;
  if p_to_stage in ('loading', 'in_transit') and (p_occurred_at is null or length(btrim(coalesce(p_location, ''))) = 0) then
    raise exception 'date/time and location are required' using errcode = '23502';
  end if;
  if p_to_stage = 'loading' and not exists (select 1 from public.trips r where r.transport_id = p_transport_id) then
    raise exception 'create at least one trip before loading' using errcode = '23502';
  end if;
  if p_to_stage = 'in_transit' and not exists (
       select 1 from public.trips r where r.transport_id = p_transport_id and r.trip_stage = 'in_transit') then
    raise exception 'at least one trip must be in transit' using errcode = '23502';
  end if;
  perform public.wf_transition('shipment', p_transport_id, p_to_stage, p_note);
  insert into public.shipment_stage_history(transport_id, workspace_id, from_stage, to_stage, note, actor_id, occurred_at, location)
  values (p_transport_id, v_t.workspace_id, v_t.stage, p_to_stage, nullif(btrim(p_note), ''), auth.uid(), p_occurred_at, nullif(btrim(p_location), ''));
  insert into public.tenant_audit_events(workspace_id, actor_user_id, action, object_type, object_id, before_state, after_state)
  values (v_t.workspace_id, auth.uid(), 'shipment.stage_changed', 'transport', p_transport_id::text,
          jsonb_build_object('stage', v_t.stage), jsonb_build_object('stage', p_to_stage));
  return p_to_stage;
end
$function$;

-- Trip v1: the assigned logistician creates it at preparation (idempotent).
alter table public.trips add column if not exists origin text, add column if not exists destination text;
drop function if exists public.create_trip(uuid, uuid, text, text, text, text, text, text, text, uuid);
create or replace function public.create_trip(
  p_transport_id uuid, p_client_key uuid, p_mode text, p_origin text default null,
  p_destination text default null, p_name text default null)
returns table (trip_id uuid, sequence int, created boolean)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_t public.transports%rowtype;
  v_id uuid;
  v_seq int;
begin
  select * into v_t from public.transports where id = p_transport_id for update;
  if not found or v_t.workspace_id is null then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if v_t.logist_id is distinct from auth.uid() or not public.has_workspace_role(v_t.workspace_id, array['logistician']) then
    raise exception 'only the assigned logistician creates trips' using errcode = '42501';
  end if;
  if p_client_key is null then
    raise exception 'idempotency key is required' using errcode = '23502';
  end if;
  select r.id, r.sequence into v_id, v_seq from public.trips r where r.transport_id = p_transport_id and r.client_key = p_client_key;
  if v_id is not null then
    return query select v_id, v_seq, false;
    return;
  end if;
  if p_mode is null or p_mode not in ('road','rail','sea','air','multimodal') then
    raise exception 'transport mode is required' using errcode = '23502';
  end if;
  select coalesce(max(r.sequence), 0) + 1 into v_seq from public.trips r where r.transport_id = p_transport_id;
  perform set_config('exim.trip_write', 'on', true);
  insert into public.trips(transport_id, name, mode, sequence, origin, destination, route, assignee_id, client_key, trip_stage)
  values (p_transport_id, coalesce(nullif(btrim(p_name), ''), 'Рейс ' || v_seq), p_mode, v_seq,
          coalesce(nullif(btrim(p_origin), ''), v_t.origin), coalesce(nullif(btrim(p_destination), ''), v_t.destination),
          coalesce(nullif(btrim(p_origin), ''), v_t.origin) || ' → ' || coalesce(nullif(btrim(p_destination), ''), v_t.destination),
          auth.uid(), p_client_key, 'preparation')
  returning id into v_id;
  perform set_config('exim.trip_write', '', true);
  insert into public.tenant_audit_events(workspace_id, actor_user_id, action, object_type, object_id, after_state)
  values (v_t.workspace_id, auth.uid(), 'trip.created', 'trip', v_id::text,
          jsonb_build_object('transport_id', p_transport_id, 'sequence', v_seq));
  return query select v_id, v_seq, true;
end
$function$;

-- preparation -> transport_assigned: partner and mode-specific reference (road: vehicle and driver)
create or replace function public.assign_trip_transport(
  p_trip_id uuid, p_carrier text, p_vehicle_no text default null, p_driver text default null,
  p_container_no text default null, p_wagon_no text default null, p_flight_no text default null, p_bill_no text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare v_r public.trips%rowtype;
begin
  select * into v_r from public.trips where id = p_trip_id for update;
  if not found or v_r.assignee_id is distinct from auth.uid() then
    raise exception 'only the trip assignee' using errcode = '42501';
  end if;
  if length(btrim(coalesce(p_carrier, ''))) = 0 then
    raise exception 'carrier is required' using errcode = '23502';
  end if;
  if (v_r.mode = 'road' and (length(btrim(coalesce(p_vehicle_no, ''))) = 0 or length(btrim(coalesce(p_driver, ''))) = 0))
     or (v_r.mode = 'rail' and length(btrim(coalesce(p_wagon_no, p_container_no, ''))) = 0)
     or (v_r.mode = 'sea' and length(btrim(coalesce(p_container_no, p_bill_no, ''))) = 0)
     or (v_r.mode = 'air' and length(btrim(coalesce(p_flight_no, ''))) = 0)
     or (v_r.mode = 'multimodal' and length(btrim(coalesce(p_vehicle_no, p_container_no, p_wagon_no, p_flight_no, ''))) = 0) then
    raise exception 'transport reference for mode % is required', v_r.mode using errcode = '23502';
  end if;
  update public.trips set carrier = btrim(p_carrier), vehicle_no = nullif(btrim(p_vehicle_no), ''), driver = coalesce(btrim(p_driver), ''),
         container_no = nullif(btrim(p_container_no), ''), wagon_no = nullif(btrim(p_wagon_no), ''),
         flight_no = nullif(btrim(p_flight_no), ''), bill_no = nullif(btrim(p_bill_no), '')
   where id = p_trip_id;
  perform public.wf_transition('trip', p_trip_id, 'transport_assigned', null);
end
$function$;

-- transport_assigned -> loading -> in_transit: date/time, location and source
drop function if exists public.advance_trip(uuid, text);
create or replace function public.advance_trip(
  p_trip_id uuid, p_to_stage text, p_occurred_at timestamptz default null,
  p_location text default null, p_source text default null)
returns text
language plpgsql
security definer
set search_path = ''
as $function$
declare v_r public.trips%rowtype; v_ws uuid;
begin
  select * into v_r from public.trips where id = p_trip_id for update;
  if not found or v_r.assignee_id is distinct from auth.uid() then
    raise exception 'only the trip assignee moves the trip' using errcode = '42501';
  end if;
  if p_occurred_at is null or length(btrim(coalesce(p_location, ''))) = 0 or length(btrim(coalesce(p_source, ''))) = 0 then
    raise exception 'date/time, location and source are required' using errcode = '23502';
  end if;
  perform public.wf_transition('trip', p_trip_id, p_to_stage,
    to_char(p_occurred_at at time zone 'UTC', 'YYYY-MM-DD HH24:MI') || ' UTC · ' || btrim(p_location) || ' · ' || btrim(p_source));
  select t.workspace_id into v_ws from public.transports t where t.id = v_r.transport_id;
  insert into public.tenant_audit_events(workspace_id, actor_user_id, action, object_type, object_id, before_state, after_state)
  values (v_ws, auth.uid(), 'trip.stage_changed', 'trip', p_trip_id::text,
          jsonb_build_object('stage', v_r.trip_stage), jsonb_build_object('stage', p_to_stage));
  return p_to_stage;
end
$function$;

-- =====================================================================
-- 6. Privileges
-- =====================================================================
drop function if exists public.wf_patch_function(text, text, text);
revoke all on function public.rate_is_valid(public.rate_quotes) from public, anon;
grant execute on function public.rate_is_valid(public.rate_quotes) to authenticated;
do $do$
declare f text;
begin
  foreach f in array array[
    'public.logist_request_data(uuid, text)', 'public.assign_logist(uuid, uuid, timestamptz)',
    'public.logist_accept(uuid)', 'public.complete_rate_search(uuid)', 'public.close_without_rate(uuid, text)',
    'public.select_rate(uuid, uuid)', 'public.send_offer(uuid, numeric, text, text, date, text)',
    'public.request_offer_clarification(uuid, text)', 'public.decide_offer(uuid, text, text)',
    'public.decide_offer(uuid, text)', 'public.record_agreement(uuid, text, date, text, text)',
    'public.create_shipment(uuid, text)', 'public.return_for_clarification(uuid, text)',
    'public.answer_clarification(uuid, text)', 'public.revise_order(uuid, jsonb, text)',
    'public.advance_shipment(uuid, text, text, timestamptz, text)',
    'public.create_trip(uuid, uuid, text, text, text, text)',
    'public.assign_trip_transport(uuid, text, text, text, text, text, text, text)',
    'public.advance_trip(uuid, text, timestamptz, text, text)']
  loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end
$do$;
