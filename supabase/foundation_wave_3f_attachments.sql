-- TASK-2026-001 Wave 3f: photos and documents attached to a request (REQ-001).
-- Private bucket "request-files"; object path = <workspace_id>/<order_id>/<uuid>-<file name>.
-- Depends on: foundation_wave_3e_clarifications.sql. Requires Supabase Storage (schema "storage").

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('request-files', 'request-files', false, 20971520,
        array['image/jpeg','image/png','image/webp','image/heic','application/pdf',
              'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
              'application/vnd.openxmlformats-officedocument.wordprocessingml.document'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.try_uuid(p text)
returns uuid
language plpgsql
immutable
set search_path = ''
as $function$
begin
  return p::uuid;
exception when others then
  return null;
end
$function$;

-- Who may add files to a request: client of the company while the request is editable,
-- staff of the workspace until the order is converted.
create or replace function public.can_attach_to_order(p_workspace_id uuid, p_order_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1 from public.orders o
    where o.id = p_order_id and o.workspace_id = p_workspace_id
      and (
        (public.is_client_of_company(o.workspace_id, o.client_company_id)
           and o.status in ('draft', 'new', 'clarification', 'assigned', 'calculated'))
        or (public.has_workspace_role(o.workspace_id, array['manager', 'tenant_admin'])
           and o.status not in ('converted', 'archived'))
      )
  )
$function$;

create or replace function public.can_read_order_file(p_workspace_id uuid, p_order_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (select 1 from public.orders o where o.id = p_order_id and o.workspace_id = p_workspace_id)
     and public.can_read_order(p_order_id)
$function$;

drop policy if exists request_files_insert on storage.objects;
drop policy if exists request_files_select on storage.objects;
create policy request_files_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'request-files'
    and public.can_attach_to_order(public.try_uuid((storage.foldername(name))[1]),
                                   public.try_uuid((storage.foldername(name))[2])));
create policy request_files_select on storage.objects for select to authenticated
  using (bucket_id = 'request-files'
    and public.can_read_order_file(public.try_uuid((storage.foldername(name))[1]),
                                   public.try_uuid((storage.foldername(name))[2])));
-- No update/delete policies: files are never replaced or removed by users.

create table if not exists public.order_attachments (
  id           uuid primary key default gen_random_uuid(),
  order_id     uuid not null references public.orders (id) on delete restrict,
  workspace_id uuid not null references public.tenant_workspaces (id),
  kind         text not null check (kind in ('photo', 'document')),
  object_path  text not null unique,
  file_name    text not null check (length(file_name) between 1 and 255),
  mime_type    text not null,
  size_bytes   bigint not null check (size_bytes > 0 and size_bytes <= 20971520),
  uploaded_by  uuid not null references auth.users (id),
  created_at   timestamptz not null default now()
);
alter table public.order_attachments enable row level security;
drop policy if exists order_attachments_select on public.order_attachments;
create policy order_attachments_select on public.order_attachments for select to authenticated
  using (public.can_read_order(order_id));
revoke all on public.order_attachments from anon, authenticated;
grant select on public.order_attachments to authenticated;

-- Registers an uploaded object. The object must exist in the request's folder and
-- have been uploaded by the caller; size and type are taken from storage, not from the client.
create or replace function public.register_attachment(p_order_id uuid, p_object_path text, p_file_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_ws uuid;
  v_obj record;
  v_mime text;
  v_size bigint;
  v_id uuid;
begin
  select o.workspace_id into v_ws from public.orders o where o.id = p_order_id;
  if v_ws is null or not public.can_attach_to_order(v_ws, p_order_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_object_path is null or p_object_path not like v_ws::text || '/' || p_order_id::text || '/%' then
    raise exception 'file is outside the request folder' using errcode = '42501';
  end if;
  select so.owner, so.metadata into v_obj from storage.objects so
   where so.bucket_id = 'request-files' and so.name = p_object_path;
  if not found or v_obj.owner is distinct from auth.uid() then
    raise exception 'file not found' using errcode = '42501';
  end if;
  v_mime := coalesce(v_obj.metadata->>'mimetype', '');
  v_size := coalesce((v_obj.metadata->>'size')::bigint, 0);
  if v_mime not in ('image/jpeg','image/png','image/webp','image/heic','application/pdf',
                    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                    'application/vnd.openxmlformats-officedocument.wordprocessingml.document') then
    raise exception 'file type is not allowed' using errcode = '22023';
  end if;
  insert into public.order_attachments(order_id, workspace_id, kind, object_path, file_name, mime_type, size_bytes, uploaded_by)
  values (p_order_id, v_ws, case when v_mime like 'image/%' then 'photo' else 'document' end,
          p_object_path, left(coalesce(nullif(btrim(p_file_name), ''), 'file'), 255), v_mime, v_size, auth.uid())
  on conflict (object_path) do nothing
  returning id into v_id;
  if v_id is null then
    select a.id into v_id from public.order_attachments a where a.object_path = p_object_path;
  end if;
  return v_id;
end
$function$;

revoke all on function public.register_attachment(uuid, text, text) from public, anon;
revoke all on function public.can_attach_to_order(uuid, uuid) from public, anon;
revoke all on function public.can_read_order_file(uuid, uuid) from public, anon;
grant execute on function public.register_attachment(uuid, text, text) to authenticated;
grant execute on function public.can_attach_to_order(uuid, uuid) to authenticated;
grant execute on function public.can_read_order_file(uuid, uuid) to authenticated;
