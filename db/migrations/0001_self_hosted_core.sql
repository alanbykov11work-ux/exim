-- EXIM Super App self-hosted PostgreSQL foundation.
-- Ordinary PostgreSQL 16: no Supabase auth schema, auth.uid(), storage API,
-- realtime publication or provider-specific roles.

create extension if not exists pgcrypto;
create extension if not exists citext;

create table if not exists public.schema_migrations (
  version    text primary key,
  checksum   text not null,
  applied_at timestamptz not null default now()
);

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'exim_superapp_app') then
    execute 'create role exim_superapp_app nologin nosuperuser nocreatedb nocreaterole noinherit';
  end if;
end;
$$;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table public.app_users (
  id                 uuid primary key default gen_random_uuid(),
  email              citext not null unique,
  password_hash      text not null,
  email_confirmed_at timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  check (email = btrim(email::text)),
  check (char_length(email::text) between 3 and 320),
  check (char_length(password_hash) >= 20)
);

create trigger trg_app_users_touch
before update on public.app_users
for each row execute function public.touch_updated_at();

create table public.app_sessions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.app_users(id) on delete cascade,
  token_hash   text not null unique,
  expires_at   timestamptz not null,
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  check (expires_at > created_at),
  check (char_length(token_hash) >= 32)
);

create index idx_app_sessions_user_expires
  on public.app_sessions(user_id, expires_at desc);
create index idx_app_sessions_expires
  on public.app_sessions(expires_at);

create table public.password_reset_tokens (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.app_users(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at    timestamptz,
  created_at timestamptz not null default now(),
  check (expires_at > created_at),
  check (used_at is null or used_at >= created_at),
  check (char_length(token_hash) >= 32)
);

create index idx_password_reset_tokens_user_active
  on public.password_reset_tokens(user_id, expires_at desc)
  where used_at is null;

create table public.auth_rate_limits (
  key               text primary key,
  failures          integer not null default 0 check (failures >= 0),
  window_started_at timestamptz not null default now(),
  locked_until      timestamptz,
  updated_at        timestamptz not null default now(),
  check (char_length(key) between 16 and 256)
);

create trigger trg_auth_rate_limits_touch
before update on public.auth_rate_limits
for each row execute function public.touch_updated_at();

create index idx_auth_rate_limits_locked
  on public.auth_rate_limits(locked_until)
  where locked_until is not null;

create table public.profiles (
  id         uuid primary key references public.app_users(id) on delete cascade,
  email      citext not null unique,
  full_name  text not null default '',
  company    text not null default '',
  phone      text not null default '',
  bin        text not null default '',
  role       text not null default 'client'
             check (role in ('client', 'manager', 'logist', 'admin')),
  verified   boolean not null default false,
  staff_code integer unique check (staff_code is null or staff_code > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_profiles_touch
before update on public.profiles
for each row execute function public.touch_updated_at();

create table public.organizations (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (char_length(btrim(name)) between 1 and 200),
  slug       text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,62}$'),
  status     text not null default 'active' check (status in ('active', 'suspended')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_organizations_touch
before update on public.organizations
for each row execute function public.touch_updated_at();

create table public.tenant_workspaces (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  name            text not null check (char_length(btrim(name)) between 1 and 200),
  slug            text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,62}$'),
  status          text not null default 'active' check (status in ('active', 'suspended')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (id, organization_id)
);

create trigger trg_tenant_workspaces_touch
before update on public.tenant_workspaces
for each row execute function public.touch_updated_at();

create index idx_tenant_workspaces_organization
  on public.tenant_workspaces(organization_id, status);

create table public.client_companies (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.tenant_workspaces(id) on delete restrict,
  name         text not null check (char_length(btrim(name)) between 1 and 200),
  bin          text,
  status       text not null default 'active' check (status in ('active', 'suspended')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (id, workspace_id)
);

create trigger trg_client_companies_touch
before update on public.client_companies
for each row execute function public.touch_updated_at();

create index idx_client_companies_workspace_status
  on public.client_companies(workspace_id, status);
create unique index uq_client_companies_workspace_bin
  on public.client_companies(workspace_id, bin)
  where bin is not null and btrim(bin) <> '';

create table public.workspace_memberships (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references public.app_users(id) on delete restrict,
  workspace_id      uuid not null references public.tenant_workspaces(id) on delete restrict,
  role              text not null
                    check (role in ('client', 'manager', 'logistician', 'tenant_admin')),
  client_company_id uuid,
  status            text not null default 'active'
                    check (status in ('active', 'invited', 'suspended', 'revoked')),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  foreign key (client_company_id, workspace_id)
    references public.client_companies(id, workspace_id) on delete restrict,
  check (
    (role = 'client' and client_company_id is not null)
    or (role <> 'client' and client_company_id is null)
  ),
  unique nulls not distinct (workspace_id, user_id, role, client_company_id)
);

create trigger trg_workspace_memberships_touch
before update on public.workspace_memberships
for each row execute function public.touch_updated_at();

create index idx_workspace_memberships_user_active
  on public.workspace_memberships(user_id, workspace_id)
  where status = 'active';
create index idx_workspace_memberships_workspace_role
  on public.workspace_memberships(workspace_id, role, status);
create index idx_workspace_memberships_client_company
  on public.workspace_memberships(workspace_id, client_company_id)
  where client_company_id is not null and status = 'active';

create table public.organization_capabilities (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  capability      text not null check (capability in ('shipper', 'carrier', 'forwarder', 'client')),
  enabled         boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  primary key (organization_id, capability)
);

create trigger trg_organization_capabilities_touch
before update on public.organization_capabilities
for each row execute function public.touch_updated_at();

create table public.module_entitlements (
  workspace_id uuid not null references public.tenant_workspaces(id) on delete cascade,
  module_key   text not null check (module_key ~ '^[a-z][a-z0-9_-]{1,62}$'),
  enabled      boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  primary key (workspace_id, module_key)
);

create trigger trg_module_entitlements_touch
before update on public.module_entitlements
for each row execute function public.touch_updated_at();

create table public.tenant_audit_events (
  id                bigint generated always as identity primary key,
  workspace_id      uuid not null references public.tenant_workspaces(id) on delete restrict,
  actor_user_id     uuid references public.app_users(id) on delete set null,
  client_company_id uuid,
  event_type        text not null check (char_length(event_type) between 1 and 120),
  entity_type       text,
  entity_id         text,
  metadata          jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at        timestamptz not null default now(),
  foreign key (client_company_id, workspace_id)
    references public.client_companies(id, workspace_id) on delete restrict
);

create index idx_tenant_audit_workspace_created
  on public.tenant_audit_events(workspace_id, created_at desc);
create index idx_tenant_audit_entity
  on public.tenant_audit_events(workspace_id, entity_type, entity_id, created_at desc);

create table public.user_state (
  workspace_id uuid not null references public.tenant_workspaces(id) on delete cascade,
  user_id      uuid not null references public.app_users(id) on delete cascade,
  key          text not null check (char_length(key) between 1 and 120),
  value        jsonb not null default '{}'::jsonb,
  updated_at   timestamptz not null default now(),
  primary key (workspace_id, user_id, key)
);

create trigger trg_user_state_touch
before update on public.user_state
for each row execute function public.touch_updated_at();

create table public.orders (
  id                     uuid primary key default gen_random_uuid(),
  workspace_id           uuid not null references public.tenant_workspaces(id) on delete restrict,
  client_company_id      uuid not null,
  ref                    text not null,
  client_id              uuid not null references public.profiles(id) on delete restrict,
  created_by             uuid not null references public.profiles(id) on delete restrict,
  manager_id             uuid references public.profiles(id) on delete restrict,
  logist_id              uuid references public.profiles(id) on delete restrict,
  origin                 text not null,
  destination            text not null,
  transport              text not null default '',
  cargo                  text not null default '',
  weight                 text not null default '',
  container              text not null default '',
  comment                text not null default '',
  status                 text not null default 'new'
                         check (status in ('new', 'assigned', 'calculated', 'offer_sent', 'approved', 'rejected', 'contract_signed', 'converted', 'archived')),
  calc_deadline          timestamptz,
  calc_route             text not null default '',
  calc_days              text not null default '',
  calc_comment           text not null default '',
  calc_submitted_at      timestamptz,
  total_price            numeric(18,2) check (total_price is null or total_price >= 0),
  offer_comment          text not null default '',
  offer_sent_at          timestamptz,
  client_decision        text check (client_decision in ('approved', 'rejected')),
  client_decision_at     timestamptz,
  contract_signed_at     timestamptz,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  foreign key (client_company_id, workspace_id)
    references public.client_companies(id, workspace_id) on delete restrict,
  unique (id, workspace_id),
  unique (workspace_id, ref)
);

create trigger trg_orders_touch
before update on public.orders
for each row execute function public.touch_updated_at();

create index idx_orders_workspace_status_created
  on public.orders(workspace_id, status, created_at desc);
create index idx_orders_client_scope
  on public.orders(workspace_id, client_company_id, created_at desc);
create index idx_orders_assignees
  on public.orders(workspace_id, manager_id, logist_id, status);

create table public.order_finance (
  order_id    uuid primary key,
  workspace_id uuid not null,
  cost        numeric(18,2) check (cost is null or cost >= 0),
  expenses    jsonb not null default '[]'::jsonb check (jsonb_typeof(expenses) = 'array'),
  margin      numeric(18,2),
  updated_at  timestamptz not null default now(),
  foreign key (order_id, workspace_id)
    references public.orders(id, workspace_id) on delete cascade
);

create trigger trg_order_finance_touch
before update on public.order_finance
for each row execute function public.touch_updated_at();

create index idx_order_finance_workspace on public.order_finance(workspace_id);

create table public.order_history (
  id           bigint generated always as identity primary key,
  order_id     uuid not null,
  workspace_id uuid not null,
  actor_id     uuid references public.app_users(id) on delete set null,
  action       text not null check (char_length(action) between 1 and 120),
  snapshot     jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now(),
  foreign key (order_id, workspace_id)
    references public.orders(id, workspace_id) on delete cascade
);

create index idx_order_history_order_created
  on public.order_history(workspace_id, order_id, created_at desc);

create table public.transports (
  id                uuid primary key default gen_random_uuid(),
  workspace_id      uuid not null references public.tenant_workspaces(id) on delete restrict,
  client_company_id uuid not null,
  ref               text not null,
  order_id          uuid,
  client_id         uuid not null references public.profiles(id) on delete restrict,
  manager_id        uuid references public.profiles(id) on delete restrict,
  logist_id         uuid references public.profiles(id) on delete restrict,
  origin            text not null,
  destination       text not null,
  status            text not null default 'preparing'
                    check (status in ('preparing', 'loading', 'in_transit', 'customs', 'delivering', 'delivered', 'archived')),
  progress          integer not null default 5 check (progress between 0 and 100),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  foreign key (client_company_id, workspace_id)
    references public.client_companies(id, workspace_id) on delete restrict,
  foreign key (order_id, workspace_id)
    references public.orders(id, workspace_id) on delete restrict,
  unique (id, workspace_id),
  unique (workspace_id, ref),
  unique (workspace_id, order_id)
);

create trigger trg_transports_touch
before update on public.transports
for each row execute function public.touch_updated_at();

create index idx_transports_workspace_status
  on public.transports(workspace_id, status, created_at desc);
create index idx_transports_client_scope
  on public.transports(workspace_id, client_company_id, created_at desc);

create table public.trips (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  transport_id uuid not null,
  name         text not null,
  driver       text not null default '',
  status       text not null default 'active'
               check (status in ('planned', 'active', 'completed', 'cancelled')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  foreign key (transport_id, workspace_id)
    references public.transports(id, workspace_id) on delete cascade,
  unique (id, workspace_id)
);

create trigger trg_trips_touch
before update on public.trips
for each row execute function public.touch_updated_at();

create index idx_trips_transport
  on public.trips(workspace_id, transport_id, created_at);

create table public.trip_events (
  id            bigint generated always as identity primary key,
  workspace_id  uuid not null,
  transport_id  uuid not null,
  trip_id       uuid,
  internal_text text not null,
  created_by    uuid references public.app_users(id) on delete set null,
  created_at    timestamptz not null default now(),
  processed     boolean not null default false,
  foreign key (transport_id, workspace_id)
    references public.transports(id, workspace_id) on delete cascade,
  foreign key (trip_id, workspace_id)
    references public.trips(id, workspace_id) on delete restrict,
  unique (id, workspace_id)
);

create index idx_trip_events_transport_created
  on public.trip_events(workspace_id, transport_id, created_at desc);
create index idx_trip_events_unprocessed
  on public.trip_events(workspace_id, processed, created_at)
  where processed = false;

create table public.transport_updates (
  id            bigint generated always as identity primary key,
  workspace_id  uuid not null,
  transport_id  uuid not null,
  source_event  bigint,
  public_text   text not null,
  published_by  uuid references public.app_users(id) on delete set null,
  created_at    timestamptz not null default now(),
  foreign key (transport_id, workspace_id)
    references public.transports(id, workspace_id) on delete cascade,
  foreign key (source_event, workspace_id)
    references public.trip_events(id, workspace_id) on delete restrict
);

create index idx_transport_updates_transport_created
  on public.transport_updates(workspace_id, transport_id, created_at desc);

create table public.leads (
  id                uuid primary key default gen_random_uuid(),
  workspace_id      uuid not null references public.tenant_workspaces(id) on delete restrict,
  client_company_id uuid,
  ref               text not null,
  name              text not null default '',
  company           text not null default '',
  phone             text not null default '',
  email             citext,
  source            text not null default 'manual'
                    check (source in ('site', 'whatsapp', 'call', 'referral', 'manual', 'other')),
  title             text not null default '',
  amount            numeric(18,2) check (amount is null or amount >= 0),
  stage             text not null default 'new'
                    check (stage in ('new', 'qualified', 'proposal', 'negotiation', 'won', 'lost')),
  lost_reason       text not null default '',
  note              text not null default '',
  owner_id          uuid references public.profiles(id) on delete restrict,
  created_by        uuid references public.profiles(id) on delete restrict,
  order_id          uuid,
  stage_changed_at  timestamptz not null default now(),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  foreign key (client_company_id, workspace_id)
    references public.client_companies(id, workspace_id) on delete restrict,
  foreign key (order_id, workspace_id)
    references public.orders(id, workspace_id) on delete restrict,
  unique (id, workspace_id),
  unique (workspace_id, ref)
);

create trigger trg_leads_touch
before update on public.leads
for each row execute function public.touch_updated_at();

create index idx_leads_workspace_stage
  on public.leads(workspace_id, stage, created_at desc);
create index idx_leads_owner
  on public.leads(workspace_id, owner_id, stage);

create table public.lead_history (
  id           bigint generated always as identity primary key,
  workspace_id uuid not null,
  lead_id      uuid not null,
  actor_id     uuid references public.app_users(id) on delete set null,
  action       text not null check (char_length(action) between 1 and 120),
  snapshot     jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now(),
  foreign key (lead_id, workspace_id)
    references public.leads(id, workspace_id) on delete cascade
);

create index idx_lead_history_lead_created
  on public.lead_history(workspace_id, lead_id, created_at desc);

create table public.chats (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.tenant_workspaces(id) on delete restrict,
  name         text not null default '',
  is_group     boolean not null default false,
  created_by   uuid not null references public.app_users(id) on delete restrict,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (id, workspace_id)
);

create trigger trg_chats_touch
before update on public.chats
for each row execute function public.touch_updated_at();

create index idx_chats_workspace_created
  on public.chats(workspace_id, created_at desc);

create table public.chat_members (
  workspace_id uuid not null,
  chat_id      uuid not null,
  user_id      uuid not null references public.app_users(id) on delete cascade,
  added_by     uuid references public.app_users(id) on delete set null,
  joined_at    timestamptz not null default now(),
  last_read_at timestamptz not null default now(),
  primary key (chat_id, user_id),
  foreign key (chat_id, workspace_id)
    references public.chats(id, workspace_id) on delete cascade
);

create index idx_chat_members_user
  on public.chat_members(workspace_id, user_id, last_read_at);

create table public.chat_messages (
  id           bigint generated always as identity primary key,
  workspace_id uuid not null,
  chat_id      uuid not null,
  sender_id    uuid not null references public.app_users(id) on delete restrict,
  text         text not null,
  file_path    text,
  file_name    text,
  created_at   timestamptz not null default now(),
  foreign key (chat_id, workspace_id)
    references public.chats(id, workspace_id) on delete cascade
);

create index idx_chat_messages_chat_created
  on public.chat_messages(workspace_id, chat_id, created_at);

create table public.tasks (
  id                uuid primary key default gen_random_uuid(),
  workspace_id      uuid not null references public.tenant_workspaces(id) on delete restrict,
  client_company_id uuid,
  title             text not null,
  description       text not null default '',
  creator_id        uuid not null references public.app_users(id) on delete restrict,
  assignee_id       uuid not null references public.app_users(id) on delete restrict,
  deadline          timestamptz,
  priority          text not null default 'normal' check (priority in ('low', 'normal', 'high')),
  status            text not null default 'new'
                    check (status in ('new', 'in_progress', 'review', 'done', 'deferred')),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  foreign key (client_company_id, workspace_id)
    references public.client_companies(id, workspace_id) on delete restrict,
  unique (id, workspace_id)
);

create trigger trg_tasks_touch
before update on public.tasks
for each row execute function public.touch_updated_at();

create index idx_tasks_assignee_status
  on public.tasks(workspace_id, assignee_id, status, deadline);
create index idx_tasks_creator
  on public.tasks(workspace_id, creator_id, created_at desc);

create table public.task_comments (
  id           bigint generated always as identity primary key,
  workspace_id uuid not null,
  task_id      uuid not null,
  author_id    uuid not null references public.app_users(id) on delete restrict,
  text         text not null,
  created_at   timestamptz not null default now(),
  foreign key (task_id, workspace_id)
    references public.tasks(id, workspace_id) on delete cascade
);

create index idx_task_comments_task_created
  on public.task_comments(workspace_id, task_id, created_at);

create table public.documents (
  id                uuid primary key default gen_random_uuid(),
  workspace_id      uuid not null references public.tenant_workspaces(id) on delete restrict,
  client_company_id uuid,
  order_id          uuid,
  transport_id      uuid,
  uploaded_by       uuid not null references public.app_users(id) on delete restrict,
  folder            text not null default 'documents'
                    check (folder ~ '^[a-zA-Z0-9][a-zA-Z0-9/_-]{0,199}$'),
  name              text not null check (char_length(name) between 1 and 255),
  storage_key       text not null,
  mime_type         text not null default 'application/octet-stream',
  size_bytes        bigint not null check (size_bytes >= 0),
  sha256            text check (sha256 is null or sha256 ~ '^[0-9a-f]{64}$'),
  visibility        text not null default 'internal'
                    check (visibility in ('internal', 'client')),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  foreign key (client_company_id, workspace_id)
    references public.client_companies(id, workspace_id) on delete restrict,
  foreign key (order_id, workspace_id)
    references public.orders(id, workspace_id) on delete cascade,
  foreign key (transport_id, workspace_id)
    references public.transports(id, workspace_id) on delete cascade,
  unique (workspace_id, storage_key)
);

create trigger trg_documents_touch
before update on public.documents
for each row execute function public.touch_updated_at();

create index idx_documents_order
  on public.documents(workspace_id, order_id, created_at desc)
  where order_id is not null;
create index idx_documents_transport
  on public.documents(workspace_id, transport_id, created_at desc)
  where transport_id is not null;
create index idx_documents_client_scope
  on public.documents(workspace_id, client_company_id, visibility, created_at desc);

comment on table public.workspace_memberships is
  'Server-authorized roles. A UI role switch must never create or elevate a membership.';
comment on column public.order_finance.cost is
  'Internal field. Never serialize to a client-role response.';
comment on column public.order_finance.margin is
  'Internal field. Never serialize to a client-role response.';
comment on column public.trip_events.internal_text is
  'Internal field. Clients receive only transport_updates.public_text.';

revoke create on schema public from public;
revoke all on all tables in schema public from public;
revoke all on all sequences in schema public from public;

grant usage on schema public to exim_superapp_app;
grant select, insert, update, delete on table
  public.app_users,
  public.app_sessions,
  public.password_reset_tokens,
  public.auth_rate_limits,
  public.profiles,
  public.organizations,
  public.tenant_workspaces,
  public.client_companies,
  public.workspace_memberships,
  public.organization_capabilities,
  public.module_entitlements,
  public.user_state,
  public.orders,
  public.order_finance,
  public.order_history,
  public.transports,
  public.trips,
  public.trip_events,
  public.transport_updates,
  public.leads,
  public.lead_history,
  public.chats,
  public.chat_members,
  public.chat_messages,
  public.tasks,
  public.task_comments,
  public.documents
to exim_superapp_app;

grant select, insert on table public.tenant_audit_events to exim_superapp_app;
grant usage, select on all sequences in schema public to exim_superapp_app;
revoke all on table public.schema_migrations from exim_superapp_app;
