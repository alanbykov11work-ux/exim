-- TASK-2026-001 Wave 5b: audit of critical actions (AC-TASK-007) and Gate documents (AC-TASK-019:
-- CL-006, LG-003, LG-005; D-047, D-052). Depends on: foundation_wave_5a_workflow.sql.

-- =====================================================================
-- 1. Audit: every critical write lands in tenant_audit_events
-- =====================================================================
create or replace function public.audit_critical_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_ws uuid; v_action text; v_type text; v_id text; v_after jsonb; v_before jsonb;
begin
  case tg_table_name
    when 'workflow_history' then
      v_ws := new.workspace_id; v_action := 'workflow.transition'; v_type := 'workflow_instance'; v_id := new.instance_id::text;
      v_before := jsonb_build_object('stage', new.from_stage); v_after := jsonb_build_object('stage', new.to_stage, 'comment', new.comment);
    when 'rate_quotes' then
      v_ws := new.workspace_id; v_type := 'rate_quote'; v_id := new.id::text;
      v_action := case when tg_op = 'INSERT' then 'rate_quote.created' else 'rate_quote.withdrawn' end;
      v_after := jsonb_build_object('order_id', new.order_id, 'status', new.status, 'amount', new.amount, 'currency', new.currency);
    when 'order_revisions' then
      v_ws := new.workspace_id; v_action := 'order.revised'; v_type := 'order'; v_id := new.order_id::text;
      v_after := jsonb_build_object('revision', new.revision, 'reason', new.reason);
    when 'order_clarifications' then
      v_ws := new.workspace_id; v_action := 'order.clarification_' || new.direction; v_type := 'order'; v_id := new.order_id::text;
      v_after := jsonb_build_object('offer_id', new.offer_id);
    when 'commercial_offers' then
      v_ws := new.workspace_id; v_type := 'commercial_offer'; v_id := new.id::text;
      v_action := case when tg_op = 'INSERT' then 'offer.created' else 'offer.status_changed' end;
      v_before := case when tg_op = 'UPDATE' then jsonb_build_object('status', old.status) end;
      v_after := jsonb_build_object('order_id', new.order_id, 'version', new.version, 'status', new.status);
    when 'transport_updates' then
      select t.workspace_id into v_ws from public.transports t where t.id = new.transport_id;
      v_type := 'transport_update'; v_id := new.id::text;
      v_action := case when tg_op = 'INSERT' then 'tracking.published'
                       when new.hidden and not old.hidden then 'tracking.hidden' else 'tracking.superseded' end;
      v_after := jsonb_build_object('transport_id', new.transport_id, 'version', new.version, 'source_event', new.source_event);
    when 'trip_plan_changes' then
      select t.workspace_id into v_ws from public.trips r join public.transports t on t.id = r.transport_id where r.id = new.trip_id;
      v_action := 'trip.plan_changed'; v_type := 'trip'; v_id := new.trip_id::text;
      v_before := jsonb_build_object(new.field, new.old_value); v_after := jsonb_build_object(new.field, new.new_value, 'reason', new.reason);
    when 'order_attachments' then
      v_ws := new.workspace_id; v_action := 'order.attachment_added'; v_type := 'order'; v_id := new.order_id::text;
      v_after := jsonb_build_object('attachment_id', new.id, 'kind', new.kind);
    else
      return null;
  end case;
  if v_ws is not null then
    insert into public.tenant_audit_events(workspace_id, actor_user_id, action, object_type, object_id, before_state, after_state)
    values (v_ws, auth.uid(), v_action, v_type, v_id, v_before, v_after);
  end if;
  return null;
end
$function$;

do $do$
declare t text;
begin
  foreach t in array array['workflow_history', 'order_revisions', 'order_clarifications', 'trip_plan_changes', 'order_attachments'] loop
    execute format('drop trigger if exists audit_critical_write on public.%I', t);
    execute format('create trigger audit_critical_write after insert on public.%I for each row execute function public.audit_critical_write()', t);
  end loop;
  foreach t in array array['rate_quotes', 'commercial_offers', 'transport_updates'] loop
    execute format('drop trigger if exists audit_critical_write on public.%I', t);
    execute format('create trigger audit_critical_write after insert or update on public.%I for each row execute function public.audit_critical_write()', t);
  end loop;
end
$do$;

-- =====================================================================
-- 2. Documents (CL-006, LG-005, D-052)
-- =====================================================================
create table if not exists public.documents (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references public.tenant_workspaces (id),
  object_type     text not null check (object_type in ('quote_request', 'shipment')),
  object_id       uuid not null,
  doc_type        text not null check (doc_type in ('invoice', 'packing_list', 'certificate', 'permit')),
  client_visible  boolean not null default false,   -- internal by default (LG-005)
  current_version int not null default 0,
  created_by      uuid not null references auth.users (id),
  created_at      timestamptz not null default now()
);
create table if not exists public.document_versions (
  id           uuid primary key default gen_random_uuid(),
  document_id  uuid not null references public.documents (id) on delete restrict,
  version      int not null check (version > 0),
  object_path  text not null unique,
  file_name    text not null check (length(file_name) between 1 and 255),
  mime_type    text not null,
  size_bytes   bigint not null check (size_bytes > 0 and size_bytes <= 20971520),
  storage_etag text,
  uploaded_by  uuid not null references auth.users (id),
  created_at   timestamptz not null default now(),
  unique (document_id, version)
);

-- who may see / manage a document
create or replace function public.document_object_scope(p_type text, p_object_id uuid)
returns table (workspace_id uuid, client_company_id uuid)
language sql
stable
security definer
set search_path = ''
as $function$
  select o.workspace_id, o.client_company_id from public.orders o where p_type = 'quote_request' and o.id = p_object_id
  union all
  select t.workspace_id, t.client_company_id from public.transports t where p_type = 'shipment' and t.id = p_object_id
$function$;

create or replace function public.can_manage_document_object(p_type text, p_object_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select case p_type when 'quote_request' then public.can_manage_order(p_object_id)
                     when 'shipment' then public.can_manage_transport(p_object_id) else false end
$function$;

create or replace function public.can_read_document(p_document_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1 from public.documents d
    where d.id = p_document_id
      and (public.can_manage_document_object(d.object_type, d.object_id)
           or (d.client_visible and exists (
                 select 1 from public.document_object_scope(d.object_type, d.object_id) s
                 where public.is_client_of_company(s.workspace_id, s.client_company_id)))))
$function$;

alter table public.documents enable row level security;
alter table public.document_versions enable row level security;
drop policy if exists documents_read on public.documents;
create policy documents_read on public.documents for select to authenticated using (public.can_read_document(id));
drop policy if exists document_versions_read on public.document_versions;
create policy document_versions_read on public.document_versions for select to authenticated using (public.can_read_document(document_id));
revoke all on public.documents, public.document_versions from anon, authenticated;
grant select (id, object_type, object_id, doc_type, client_visible, current_version, created_at) on public.documents to authenticated;
grant select (id, document_id, version, object_path, file_name, mime_type, size_bytes, created_at) on public.document_versions to authenticated;

-- Storage: private bucket; path <workspace>/<document>/<uuid>-<name>. Staff upload; download follows can_read_document,
-- so a staff-only file cannot be fetched by a client through a direct path or id.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('gate-documents', 'gate-documents', false, 20971520,
        array['application/pdf','image/jpeg','image/png',
              'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
              'application/vnd.openxmlformats-officedocument.wordprocessingml.document'])
on conflict (id) do update set public = false;
create or replace function public.document_path_access(p_name text, p_write boolean)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1 from public.documents d
    where d.id = public.try_uuid((storage.foldername(p_name))[2])
      and d.workspace_id = public.try_uuid((storage.foldername(p_name))[1])
      and case when p_write then public.can_manage_document_object(d.object_type, d.object_id)
               else public.can_read_document(d.id) end)
$function$;
revoke all on function public.document_path_access(text, boolean) from public, anon;
grant execute on function public.document_path_access(text, boolean) to authenticated;
drop policy if exists gate_documents_insert on storage.objects;
drop policy if exists gate_documents_select on storage.objects;
create policy gate_documents_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'gate-documents' and public.document_path_access(name, true));
create policy gate_documents_select on storage.objects for select to authenticated
  using (bucket_id = 'gate-documents' and public.document_path_access(name, false));

create or replace function public.create_document(p_object_type text, p_object_id uuid, p_doc_type text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare v_ws uuid; v_id uuid;
begin
  if not public.can_manage_document_object(p_object_type, p_object_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select s.workspace_id into v_ws from public.document_object_scope(p_object_type, p_object_id) s;
  insert into public.documents(workspace_id, object_type, object_id, doc_type, created_by)
  values (v_ws, p_object_type, p_object_id, p_doc_type, auth.uid()) returning id into v_id;
  insert into public.tenant_audit_events(workspace_id, actor_user_id, action, object_type, object_id, after_state)
  values (v_ws, auth.uid(), 'document.created', 'document', v_id::text,
          jsonb_build_object('object_type', p_object_type, 'object_id', p_object_id, 'doc_type', p_doc_type, 'client_visible', false));
  return v_id;
end
$function$;

-- A new file is a new version; earlier versions stay.
create or replace function public.add_document_version(p_document_id uuid, p_object_path text, p_file_name text)
returns int
language plpgsql
security definer
set search_path = ''
as $function$
declare d public.documents%rowtype; v_obj record; v_ver int;
begin
  select * into d from public.documents where id = p_document_id for update;
  if not found or not public.can_manage_document_object(d.object_type, d.object_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_object_path is null or p_object_path not like d.workspace_id::text || '/' || d.id::text || '/%' then
    raise exception 'file is outside the document folder' using errcode = '42501';
  end if;
  select so.owner, so.metadata into v_obj from storage.objects so where so.bucket_id = 'gate-documents' and so.name = p_object_path;
  if not found or v_obj.owner is distinct from auth.uid() then
    raise exception 'file not found' using errcode = '42501';
  end if;
  select v.version into v_ver from public.document_versions v where v.object_path = p_object_path;
  if v_ver is not null then return v_ver; end if;
  v_ver := d.current_version + 1;
  insert into public.document_versions(document_id, version, object_path, file_name, mime_type, size_bytes, storage_etag, uploaded_by)
  values (d.id, v_ver, p_object_path, left(coalesce(nullif(btrim(p_file_name), ''), 'file'), 255),
          coalesce(v_obj.metadata->>'mimetype', 'application/octet-stream'), coalesce((v_obj.metadata->>'size')::bigint, 0),
          v_obj.metadata->>'eTag', auth.uid());
  update public.documents set current_version = v_ver where id = d.id;
  insert into public.tenant_audit_events(workspace_id, actor_user_id, action, object_type, object_id, after_state)
  values (d.workspace_id, auth.uid(), case when v_ver = 1 then 'document.uploaded' else 'document.replaced' end,
          'document', d.id::text, jsonb_build_object('version', v_ver));
  return v_ver;
end
$function$;

-- Client publication is a separate action of the manager (LG-005).
create or replace function public.set_document_visibility(p_document_id uuid, p_client_visible boolean, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare d public.documents%rowtype;
begin
  select * into d from public.documents where id = p_document_id for update;
  if not found or not public.has_workspace_role(d.workspace_id, array['manager']) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if d.current_version = 0 and p_client_visible then
    raise exception 'upload a file before publishing' using errcode = '23502';
  end if;
  if length(btrim(coalesce(p_reason, ''))) < 3 then
    raise exception 'reason is required' using errcode = '23502';
  end if;
  update public.documents set client_visible = p_client_visible where id = d.id;
  insert into public.tenant_audit_events(workspace_id, actor_user_id, action, object_type, object_id, before_state, after_state, reason)
  values (d.workspace_id, auth.uid(), case when p_client_visible then 'document.published' else 'document.unpublished' end,
          'document', d.id::text, jsonb_build_object('client_visible', d.client_visible), jsonb_build_object('client_visible', p_client_visible), p_reason);
end
$function$;

-- =====================================================================
-- 3. Partner basis of the selected rate (LG-003, D-047): only after the client contract basis
-- =====================================================================
create table if not exists public.partner_bases (
  id           uuid primary key default gen_random_uuid(),
  order_id     uuid not null unique references public.orders (id) on delete restrict,
  workspace_id uuid not null references public.tenant_workspaces (id),
  rate_id      uuid not null references public.rate_quotes (id),
  partner      text not null check (length(btrim(partner)) between 1 and 200),
  terms        text not null check (length(btrim(terms)) between 3 and 4000),
  doc_ref      text not null check (length(btrim(doc_ref)) between 1 and 300),
  signed_on    date not null,
  created_by   uuid not null references auth.users (id),
  created_at   timestamptz not null default now()
);
alter table public.partner_bases enable row level security;
drop policy if exists partner_bases_staff on public.partner_bases;
create policy partner_bases_staff on public.partner_bases for select to authenticated using (public.can_manage_order(order_id));
revoke all on public.partner_bases from anon, authenticated;
grant select on public.partner_bases to authenticated;

create or replace function public.record_partner_basis(
  p_order_id uuid, p_partner text, p_terms text, p_doc_ref text, p_signed_on date)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare o public.orders%rowtype; v_id uuid;
begin
  select * into o from public.orders where id = p_order_id for update;
  if not found or not (o.logist_id = auth.uid() or public.has_workspace_role(o.workspace_id, array['manager'])) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if not exists (select 1 from public.agreement_bases a where a.order_id = p_order_id) then
    raise exception 'the client contract basis comes first (D-047)' using errcode = '22023';
  end if;
  if o.selected_rate_id is null then
    raise exception 'no selected rate' using errcode = '22023';
  end if;
  if p_signed_on is null or p_signed_on > current_date then
    raise exception 'signing date is required and cannot be in the future' using errcode = '22023';
  end if;
  select pb.id into v_id from public.partner_bases pb where pb.order_id = p_order_id;
  if v_id is not null then return v_id; end if;
  insert into public.partner_bases(order_id, workspace_id, rate_id, partner, terms, doc_ref, signed_on, created_by)
  values (p_order_id, o.workspace_id, o.selected_rate_id, btrim(p_partner), btrim(p_terms), btrim(p_doc_ref), p_signed_on, auth.uid())
  returning id into v_id;
  insert into public.tenant_audit_events(workspace_id, actor_user_id, action, object_type, object_id, after_state)
  values (o.workspace_id, auth.uid(), 'order.partner_basis_recorded', 'order', p_order_id::text,
          jsonb_build_object('partner_basis_id', v_id, 'rate_id', o.selected_rate_id));
  return v_id;
end
$function$;

do $do$
declare f text;
begin
  foreach f in array array['public.create_document(text, uuid, text)', 'public.add_document_version(uuid, text, text)',
    'public.set_document_visibility(uuid, boolean, text)', 'public.record_partner_basis(uuid, text, text, text, date)',
    'public.can_read_document(uuid)'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end
$do$;
revoke all on function public.document_object_scope(text, uuid) from public, anon, authenticated;
revoke all on function public.can_manage_document_object(text, uuid) from public, anon;
grant execute on function public.can_manage_document_object(text, uuid) to authenticated;
revoke all on function public.audit_critical_write() from public, anon, authenticated;
