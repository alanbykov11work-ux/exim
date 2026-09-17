-- TASK-2026-001 / Foundation Gate / Wave 1
-- Additive tenant security foundation. This file is intentionally not a seed:
-- it does not touch production data, create real users or infer memberships.

begin;

create table if not exists public.organizations (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(btrim(name)) between 1 and 200),
  slug        text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,62}$'),
  status      text not null default 'active' check (status in ('active', 'suspended')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.tenant_workspaces (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete restrict,
  name             text not null check (char_length(btrim(name)) between 1 and 200),
  slug             text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,62}$'),
  status           text not null default 'active' check (status in ('active', 'suspended')),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create table if not exists public.client_companies (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.tenant_workspaces(id) on delete restrict,
  name          text not null check (char_length(btrim(name)) between 1 and 200),
  bin           text,
  status        text not null default 'active' check (status in ('active', 'suspended')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (id, workspace_id)
);

create table if not exists public.workspace_memberships (
  id                 uuid primary key default gen_random_uuid(),
  workspace_id       uuid not null references public.tenant_workspaces(id) on delete restrict,
  user_id            uuid not null references auth.users(id) on delete restrict,
  role               text not null check (role in ('client', 'manager', 'logistician', 'tenant_admin')),
  client_company_id  uuid,
  status             text not null default 'active' check (status in ('active', 'suspended')),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint membership_client_scope check (
    (role = 'client' and client_company_id is not null)
    or (role <> 'client' and client_company_id is null)
  ),
  constraint membership_company_workspace_fk
    foreign key (client_company_id, workspace_id)
    references public.client_companies(id, workspace_id)
    on delete restrict
);

create unique index if not exists workspace_membership_staff_unique
  on public.workspace_memberships(workspace_id, user_id, role)
  where client_company_id is null;

create unique index if not exists workspace_membership_client_unique
  on public.workspace_memberships(workspace_id, user_id, role, client_company_id)
  where client_company_id is not null;

create index if not exists workspace_memberships_user_idx
  on public.workspace_memberships(user_id, status, workspace_id);

create table if not exists public.organization_capabilities (
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  code             text not null check (code ~ '^[a-z][a-z0-9_]{1,62}$'),
  created_at       timestamptz not null default now(),
  primary key (organization_id, code)
);

create table if not exists public.module_entitlements (
  workspace_id  uuid not null references public.tenant_workspaces(id) on delete cascade,
  module_code   text not null check (module_code ~ '^[a-z][a-z0-9_]{1,62}$'),
  enabled       boolean not null default false,
  updated_at    timestamptz not null default now(),
  primary key (workspace_id, module_code)
);

create table if not exists public.tenant_audit_events (
  id               bigint generated always as identity primary key,
  organization_id  uuid references public.organizations(id) on delete restrict,
  workspace_id     uuid references public.tenant_workspaces(id) on delete restrict,
  actor_user_id    uuid references auth.users(id) on delete set null,
  target_user_id   uuid references auth.users(id) on delete set null,
  action           text not null,
  object_type      text not null,
  object_id        text not null,
  before_state     jsonb,
  after_state      jsonb,
  reason           text,
  created_at       timestamptz not null default now(),
  constraint audit_scope_present check (organization_id is not null or workspace_id is not null)
);

create index if not exists tenant_audit_workspace_time_idx
  on public.tenant_audit_events(workspace_id, created_at desc);

create or replace function public.is_workspace_member(p_workspace_id uuid)
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
      and workspace.status = 'active'
  )
$function$;

create or replace function public.has_workspace_role(p_workspace_id uuid, p_roles text[])
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
      and membership.role = any(p_roles)
      and workspace.status = 'active'
  )
$function$;

create or replace function public.can_access_client_company(
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
      and workspace.status = 'active'
      and (
        membership.role in ('manager', 'logistician', 'tenant_admin')
        or (
          membership.role = 'client'
          and membership.client_company_id = p_client_company_id
        )
      )
  )
$function$;

create or replace function public.has_module_entitlement(
  p_workspace_id uuid,
  p_module_code text
)
returns boolean
language sql
security definer
set search_path = ''
stable
as $function$
  select public.is_workspace_member(p_workspace_id)
    and exists (
      select 1
      from public.module_entitlements entitlement
      where entitlement.workspace_id = p_workspace_id
        and entitlement.module_code = p_module_code
        and entitlement.enabled
    )
$function$;

create or replace function public.tenant_admin_upsert_membership(
  p_workspace_id uuid,
  p_user_id uuid,
  p_role text,
  p_client_company_id uuid default null,
  p_status text default 'active',
  p_reason text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_membership public.workspace_memberships;
  v_before jsonb;
begin
  if not public.has_workspace_role(p_workspace_id, array['tenant_admin']) then
    raise exception 'tenant_admin role required';
  end if;

  if p_role not in ('client', 'manager', 'logistician', 'tenant_admin') then
    raise exception 'invalid Gate role';
  end if;
  if p_status not in ('active', 'suspended') then
    raise exception 'invalid membership status';
  end if;
  if (p_role = 'client') <> (p_client_company_id is not null) then
    raise exception 'client role requires client company; staff roles forbid it';
  end if;
  if p_client_company_id is not null and not exists (
    select 1 from public.client_companies company
    where company.id = p_client_company_id
      and company.workspace_id = p_workspace_id
  ) then
    raise exception 'client company is outside workspace';
  end if;
  if not exists (select 1 from auth.users where id = p_user_id) then
    raise exception 'unknown user';
  end if;

  if p_role = 'tenant_admin' and p_status = 'suspended' and exists (
    select 1
    from public.workspace_memberships membership
    where membership.workspace_id = p_workspace_id
      and membership.user_id = p_user_id
      and membership.role = 'tenant_admin'
      and membership.status = 'active'
  ) and (
    select count(*)
    from public.workspace_memberships membership
    where membership.workspace_id = p_workspace_id
      and membership.role = 'tenant_admin'
      and membership.status = 'active'
  ) <= 1 then
    raise exception 'cannot suspend the last tenant admin';
  end if;

  select membership.* into v_membership
  from public.workspace_memberships membership
  where membership.workspace_id = p_workspace_id
    and membership.user_id = p_user_id
    and membership.role = p_role
    and membership.client_company_id is not distinct from p_client_company_id
  for update;

  if found then
    v_before := to_jsonb(v_membership);
    update public.workspace_memberships
      set status = p_status, updated_at = now()
      where id = v_membership.id
      returning * into v_membership;
  else
    insert into public.workspace_memberships (
      workspace_id, user_id, role, client_company_id, status
    ) values (
      p_workspace_id, p_user_id, p_role, p_client_company_id, p_status
    ) returning * into v_membership;
  end if;

  insert into public.tenant_audit_events (
    organization_id,
    workspace_id,
    actor_user_id,
    target_user_id,
    action,
    object_type,
    object_id,
    before_state,
    after_state,
    reason
  )
  select
    workspace.organization_id,
    workspace.id,
    auth.uid(),
    p_user_id,
    case when v_before is null then 'membership.created' else 'membership.updated' end,
    'workspace_membership',
    v_membership.id::text,
    v_before,
    to_jsonb(v_membership),
    nullif(btrim(p_reason), '')
  from public.tenant_workspaces workspace
  where workspace.id = p_workspace_id;

  return v_membership.id;
end
$function$;

create or replace function public.audit_module_entitlement_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_workspace_id uuid;
  v_module_code text;
begin
  if tg_op = 'DELETE' then
    v_workspace_id := old.workspace_id;
    v_module_code := old.module_code;
  else
    v_workspace_id := new.workspace_id;
    v_module_code := new.module_code;
  end if;

  insert into public.tenant_audit_events (
    organization_id, workspace_id, actor_user_id, action, object_type,
    object_id, before_state, after_state
  )
  select
    workspace.organization_id,
    workspace.id,
    auth.uid(),
    'entitlement.' || lower(tg_op),
    'module_entitlement',
    v_workspace_id::text || ':' || v_module_code,
    case when tg_op = 'INSERT' then null else to_jsonb(old) end,
    case when tg_op = 'DELETE' then null else to_jsonb(new) end
  from public.tenant_workspaces workspace
  where workspace.id = v_workspace_id;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end
$function$;

drop trigger if exists audit_module_entitlement_change
  on public.module_entitlements;
create trigger audit_module_entitlement_change
  after insert or update or delete on public.module_entitlements
  for each row execute function public.audit_module_entitlement_change();

drop trigger if exists trg_organizations_touch on public.organizations;
create trigger trg_organizations_touch before update on public.organizations
  for each row execute function public.touch_updated_at();
drop trigger if exists trg_tenant_workspaces_touch on public.tenant_workspaces;
create trigger trg_tenant_workspaces_touch before update on public.tenant_workspaces
  for each row execute function public.touch_updated_at();
drop trigger if exists trg_client_companies_touch on public.client_companies;
create trigger trg_client_companies_touch before update on public.client_companies
  for each row execute function public.touch_updated_at();
drop trigger if exists trg_workspace_memberships_touch on public.workspace_memberships;
create trigger trg_workspace_memberships_touch before update on public.workspace_memberships
  for each row execute function public.touch_updated_at();
drop trigger if exists trg_module_entitlements_touch on public.module_entitlements;
create trigger trg_module_entitlements_touch before update on public.module_entitlements
  for each row execute function public.touch_updated_at();

alter table public.organizations enable row level security;
alter table public.tenant_workspaces enable row level security;
alter table public.client_companies enable row level security;
alter table public.workspace_memberships enable row level security;
alter table public.organization_capabilities enable row level security;
alter table public.module_entitlements enable row level security;
alter table public.tenant_audit_events enable row level security;

drop policy if exists "organizations scoped read" on public.organizations;
create policy "organizations scoped read" on public.organizations for select using (
  exists (
    select 1
    from public.tenant_workspaces workspace
    where workspace.organization_id = organizations.id
      and public.is_workspace_member(workspace.id)
  )
);

drop policy if exists "workspaces member read" on public.tenant_workspaces;
create policy "workspaces member read" on public.tenant_workspaces for select using (
  public.is_workspace_member(id)
);

drop policy if exists "client companies scoped read" on public.client_companies;
create policy "client companies scoped read" on public.client_companies for select using (
  public.can_access_client_company(workspace_id, id)
);

drop policy if exists "memberships self or tenant admin read" on public.workspace_memberships;
create policy "memberships self or tenant admin read" on public.workspace_memberships for select using (
  user_id = auth.uid()
  or public.has_workspace_role(workspace_id, array['tenant_admin'])
);

drop policy if exists "capabilities organization member read" on public.organization_capabilities;
create policy "capabilities organization member read" on public.organization_capabilities for select using (
  exists (
    select 1
    from public.tenant_workspaces workspace
    where workspace.organization_id = organization_capabilities.organization_id
      and public.is_workspace_member(workspace.id)
  )
);

drop policy if exists "entitlements workspace member read" on public.module_entitlements;
create policy "entitlements workspace member read" on public.module_entitlements for select using (
  public.is_workspace_member(workspace_id)
);

drop policy if exists "audit tenant admin read" on public.tenant_audit_events;
create policy "audit tenant admin read" on public.tenant_audit_events for select using (
  (workspace_id is not null and public.has_workspace_role(workspace_id, array['tenant_admin']))
  or (
    organization_id is not null
    and exists (
      select 1
      from public.tenant_workspaces workspace
      where workspace.organization_id = tenant_audit_events.organization_id
        and public.has_workspace_role(workspace.id, array['tenant_admin'])
    )
  )
);

revoke all on public.organizations from anon, authenticated;
revoke all on public.tenant_workspaces from anon, authenticated;
revoke all on public.client_companies from anon, authenticated;
revoke all on public.workspace_memberships from anon, authenticated;
revoke all on public.organization_capabilities from anon, authenticated;
revoke all on public.module_entitlements from anon, authenticated;
revoke all on public.tenant_audit_events from anon, authenticated;

grant select on public.organizations to authenticated;
grant select on public.tenant_workspaces to authenticated;
grant select on public.client_companies to authenticated;
grant select on public.workspace_memberships to authenticated;
grant select on public.organization_capabilities to authenticated;
grant select on public.module_entitlements to authenticated;
grant select on public.tenant_audit_events to authenticated;

revoke all on function public.tenant_admin_upsert_membership(uuid, uuid, text, uuid, text, text)
  from public, anon;
grant execute on function public.tenant_admin_upsert_membership(uuid, uuid, text, uuid, text, text)
  to authenticated;

revoke all on function public.is_workspace_member(uuid) from public, anon;
revoke all on function public.has_workspace_role(uuid, text[]) from public, anon;
revoke all on function public.can_access_client_company(uuid, uuid) from public, anon;
revoke all on function public.has_module_entitlement(uuid, text) from public, anon;
grant execute on function public.is_workspace_member(uuid) to authenticated;
grant execute on function public.has_workspace_role(uuid, text[]) to authenticated;
grant execute on function public.can_access_client_company(uuid, uuid) to authenticated;
grant execute on function public.has_module_entitlement(uuid, text) to authenticated;

commit;
