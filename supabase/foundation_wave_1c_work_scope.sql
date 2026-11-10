-- TASK-2026-001 / Foundation Gate / Wave 1c
-- Tenant scope for CRM, tasks and chats: leads, lead_history, tasks,
-- task_comments, chats, chat_members, chat_messages.
--
-- Requires: crm.sql, chats_tasks.sql, badges.sql, foundation_wave_1.sql,
-- foundation_wave_1b_legacy_scope.sql.
--
-- Same rules as Wave 1b: fail-closed for existing rows, nothing inferred,
-- nothing deleted, explicit owner-only backfill.

begin;

-- ---------------------------------------------------------------------------
-- 1. Scope columns
-- ---------------------------------------------------------------------------
alter table public.leads
  add column if not exists workspace_id uuid references public.tenant_workspaces(id) on delete restrict;
alter table public.lead_history
  add column if not exists workspace_id uuid references public.tenant_workspaces(id) on delete restrict;
alter table public.tasks
  add column if not exists workspace_id uuid references public.tenant_workspaces(id) on delete restrict;
alter table public.task_comments
  add column if not exists workspace_id uuid references public.tenant_workspaces(id) on delete restrict;
alter table public.chats
  add column if not exists workspace_id uuid references public.tenant_workspaces(id) on delete restrict;
alter table public.chat_messages
  add column if not exists workspace_id uuid references public.tenant_workspaces(id) on delete restrict;

-- Attachment columns were added to the live database by hand and never
-- reached the repository; declaring them keeps a fresh database consistent.
alter table public.chat_messages
  add column if not exists file_path text,
  add column if not exists file_name text;

create index if not exists leads_workspace_stage_idx on public.leads(workspace_id, stage, updated_at desc);
create index if not exists lead_history_lead_time_idx on public.lead_history(lead_id, created_at desc);
create index if not exists tasks_workspace_assignee_idx on public.tasks(workspace_id, assignee_id, status);
create index if not exists tasks_workspace_creator_idx on public.tasks(workspace_id, creator_id, status);
create index if not exists task_comments_task_time_idx on public.task_comments(task_id, created_at);
create index if not exists chats_workspace_idx on public.chats(workspace_id, created_at desc);
create index if not exists chat_members_user_idx on public.chat_members(user_id);
create index if not exists chat_messages_chat_time_idx on public.chat_messages(chat_id, created_at desc);

-- ---------------------------------------------------------------------------
-- 2. Access helpers
-- ---------------------------------------------------------------------------
create or replace function public.is_active_workspace_user(p_workspace_id uuid, p_user_id uuid)
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
      and membership.user_id = p_user_id
      and membership.status = 'active'
      and workspace.status = 'active'
      -- no probing of other workspaces: the caller must be asking about
      -- itself or about a workspace it belongs to
      and (
        auth.uid() is null
        or p_user_id = auth.uid()
        or public.is_workspace_member(p_workspace_id)
      )
  )
$function$;

create or replace function public.is_workspace_staff_user(p_workspace_id uuid, p_user_id uuid)
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
      and membership.user_id = p_user_id
      and membership.status = 'active'
      and membership.role in ('manager', 'logistician', 'tenant_admin')
      and workspace.status = 'active'
      -- no probing of other workspaces: the caller must be asking about
      -- itself or about a workspace it belongs to
      and (
        auth.uid() is null
        or p_user_id = auth.uid()
        or public.is_workspace_member(p_workspace_id)
      )
  )
$function$;

-- Membership in a chat counts only while the caller is still an active
-- member of the chat's workspace: suspending a membership closes the chat.
create or replace function public.is_chat_member(p_chat uuid)
returns boolean
language sql
security definer
set search_path = ''
stable
as $function$
  select exists (
    select 1
    from public.chat_members member
    join public.chats chat on chat.id = member.chat_id
    where member.chat_id = p_chat
      and member.user_id = auth.uid()
      and chat.workspace_id is not null
      and public.is_workspace_member(chat.workspace_id)
  )
$function$;

create or replace function public.can_read_task(p_task_id uuid)
returns boolean
language sql
security definer
set search_path = ''
stable
as $function$
  select exists (
    select 1
    from public.tasks task
    where task.id = p_task_id
      and task.workspace_id is not null
      and public.is_workspace_member(task.workspace_id)
      and (
        task.creator_id = auth.uid()
        or task.assignee_id = auth.uid()
        or public.has_workspace_role(task.workspace_id, array['manager', 'tenant_admin'])
      )
  )
$function$;

-- People a member may address. Staff are visible to every member; clients
-- are visible to staff only, so one client never learns about another.
-- Email is returned to staff and to the caller, never to other clients.
create or replace function public.workspace_directory(p_workspace_id uuid)
returns table (id uuid, full_name text, role text, client_company_id uuid, email text)
language sql
security definer
set search_path = ''
stable
as $function$
  with actor as (
    select
      public.is_workspace_member(p_workspace_id) as is_member,
      public.is_workspace_staff_user(p_workspace_id, auth.uid()) as is_staff
  )
  select distinct on (profile.id)
    profile.id,
    profile.full_name,
    membership.role,
    membership.client_company_id,
    case when actor.is_staff or profile.id = auth.uid() then profile.email end
  from public.workspace_memberships membership
  join public.profiles profile on profile.id = membership.user_id
  cross join actor
  where membership.workspace_id = p_workspace_id
    and membership.status = 'active'
    and actor.is_member
    and (
      actor.is_staff
      or membership.role in ('manager', 'logistician', 'tenant_admin')
      or profile.id = auth.uid()
    )
  order by profile.id,
    array_position(array['tenant_admin', 'manager', 'logistician', 'client'], membership.role)
$function$;

-- ---------------------------------------------------------------------------
-- 3. Scope integrity
-- ---------------------------------------------------------------------------
create or replace function public.work_scope_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_backfill boolean := coalesce(current_setting('exim.legacy_backfill', true), '') = 'on';
begin
  if tg_op = 'INSERT' then
    if new.workspace_id is null then
      raise exception '% requires workspace scope', tg_table_name;
    end if;
    return new;
  end if;
  if new.workspace_id is distinct from old.workspace_id
     and not (v_backfill and old.workspace_id is null) then
    raise exception '% scope is immutable', tg_table_name;
  end if;
  return new;
end
$function$;

create or replace function public.inherit_parent_scope()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_workspace uuid;
  v_backfill boolean := coalesce(current_setting('exim.legacy_backfill', true), '') = 'on';
begin
  if tg_op = 'UPDATE' then
    if new.workspace_id is distinct from old.workspace_id
       and not (v_backfill and old.workspace_id is null) then
      raise exception '% scope is immutable', tg_table_name;
    end if;
    return new;
  end if;
  if tg_table_name = 'lead_history' then
    select workspace_id into v_workspace from public.leads where id = new.lead_id;
  elsif tg_table_name = 'task_comments' then
    select workspace_id into v_workspace from public.tasks where id = new.task_id;
  elsif tg_table_name = 'chat_messages' then
    select workspace_id into v_workspace from public.chats where id = new.chat_id;
  end if;
  if v_workspace is null then
    raise exception 'parent of % has no workspace scope', tg_table_name;
  end if;
  new.workspace_id := v_workspace;
  return new;
end
$function$;

drop trigger if exists trg_leads_scope on public.leads;
create trigger trg_leads_scope before insert or update on public.leads
  for each row execute function public.work_scope_guard();
drop trigger if exists trg_chats_scope on public.chats;
create trigger trg_chats_scope before insert or update on public.chats
  for each row execute function public.work_scope_guard();
drop trigger if exists trg_lead_history_scope on public.lead_history;
create trigger trg_lead_history_scope before insert or update on public.lead_history
  for each row execute function public.inherit_parent_scope();
drop trigger if exists trg_task_comments_scope on public.task_comments;
create trigger trg_task_comments_scope before insert or update on public.task_comments
  for each row execute function public.inherit_parent_scope();
drop trigger if exists trg_chat_messages_scope on public.chat_messages;
create trigger trg_chat_messages_scope before insert or update on public.chat_messages
  for each row execute function public.inherit_parent_scope();

-- Tasks: scope, same-workspace staff assignee, immutable author, and
-- reassignment reserved for the author or a manager.
create or replace function public.tasks_scope_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_backfill boolean := coalesce(current_setting('exim.legacy_backfill', true), '') = 'on';
begin
  if tg_op = 'INSERT' then
    if new.workspace_id is null then
      raise exception 'tasks requires workspace scope';
    end if;
  elsif new.workspace_id is distinct from old.workspace_id then
    if not (v_backfill and old.workspace_id is null) then
      raise exception 'tasks scope is immutable';
    end if;
    return new;
  end if;

  if not public.is_workspace_staff_user(new.workspace_id, new.assignee_id) then
    raise exception 'assignee must be an active staff member of the workspace';
  end if;

  if tg_op = 'UPDATE' and auth.uid() is not null then
    if new.creator_id is distinct from old.creator_id then
      raise exception 'task author is immutable';
    end if;
    if new.assignee_id is distinct from old.assignee_id
       and old.creator_id <> auth.uid()
       and not public.has_workspace_role(old.workspace_id, array['manager', 'tenant_admin']) then
      raise exception 'only the author or a manager can reassign a task';
    end if;
  end if;
  return new;
end
$function$;

drop trigger if exists trg_tasks_scope on public.tasks;
create trigger trg_tasks_scope before insert or update on public.tasks
  for each row execute function public.tasks_scope_guard();

-- ---------------------------------------------------------------------------
-- 4. Row level security
-- ---------------------------------------------------------------------------
alter table public.leads enable row level security;
alter table public.lead_history enable row level security;
alter table public.tasks enable row level security;
alter table public.task_comments enable row level security;
alter table public.chats enable row level security;
alter table public.chat_members enable row level security;
alter table public.chat_messages enable row level security;

do $cleanup$
declare
  r record;
begin
  for r in
    select tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in ('leads', 'lead_history', 'tasks', 'task_comments',
                        'chats', 'chat_members', 'chat_messages')
  loop
    execute format('drop policy %I on public.%I', r.policyname, r.tablename);
  end loop;
end
$cleanup$;

-- CRM is a sales tool: managers and tenant admins of the workspace only.
create policy "leads sales read" on public.leads for select using (
  workspace_id is not null
  and public.has_workspace_role(workspace_id, array['manager', 'tenant_admin'])
);
create policy "leads sales insert" on public.leads for insert with check (
  workspace_id is not null
  and public.has_module_entitlement(workspace_id, 'crm')
  and public.has_workspace_role(workspace_id, array['manager', 'tenant_admin'])
);
create policy "leads sales update" on public.leads for update using (
  workspace_id is not null
  and public.has_module_entitlement(workspace_id, 'crm')
  and public.has_workspace_role(workspace_id, array['manager', 'tenant_admin'])
) with check (
  workspace_id is not null
  and public.has_workspace_role(workspace_id, array['manager', 'tenant_admin'])
);

create policy "lead history sales read" on public.lead_history for select using (
  exists (
    select 1 from public.leads lead
    where lead.id = lead_id
      and lead.workspace_id is not null
      and public.has_workspace_role(lead.workspace_id, array['manager', 'tenant_admin'])
  )
);
create policy "lead history sales insert" on public.lead_history for insert with check (
  actor_id = auth.uid()
  and exists (
    select 1 from public.leads lead
    where lead.id = lead_id
      and lead.workspace_id is not null
      and public.has_workspace_role(lead.workspace_id, array['manager', 'tenant_admin'])
  )
);

-- Tasks are internal work: a client can neither create nor read them.
create policy "tasks scoped read" on public.tasks for select using (
  workspace_id is not null
  and public.is_workspace_staff_user(workspace_id, auth.uid())
  and (
    creator_id = auth.uid()
    or assignee_id = auth.uid()
    or public.has_workspace_role(workspace_id, array['manager', 'tenant_admin'])
  )
);
create policy "tasks staff insert" on public.tasks for insert with check (
  workspace_id is not null
  and creator_id = auth.uid()
  and public.has_module_entitlement(workspace_id, 'tasks')
  and public.is_workspace_staff_user(workspace_id, auth.uid())
);
create policy "tasks participant update" on public.tasks for update using (
  workspace_id is not null
  and public.has_module_entitlement(workspace_id, 'tasks')
  and public.is_workspace_staff_user(workspace_id, auth.uid())
  and (
    creator_id = auth.uid()
    or assignee_id = auth.uid()
    or public.has_workspace_role(workspace_id, array['manager', 'tenant_admin'])
  )
) with check (
  workspace_id is not null
  and public.is_workspace_staff_user(workspace_id, auth.uid())
);

create policy "task comments participant read" on public.task_comments for select using (
  public.can_read_task(task_id)
  and public.is_workspace_staff_user(workspace_id, auth.uid())
);
create policy "task comments participant insert" on public.task_comments for insert with check (
  author_id = auth.uid() and public.can_read_task(task_id)
);

-- Chats and their member lists are created only through create_chat().
create policy "chats member read" on public.chats for select using (
  public.is_chat_member(id)
);
create policy "chat members member read" on public.chat_members for select using (
  public.is_chat_member(chat_id)
);
create policy "chat members own read marker" on public.chat_members for update using (
  user_id = auth.uid() and public.is_chat_member(chat_id)
) with check (
  user_id = auth.uid()
);
create policy "chat messages member read" on public.chat_messages for select using (
  public.is_chat_member(chat_id)
);
create policy "chat messages member insert" on public.chat_messages for insert with check (
  sender_id = auth.uid() and public.is_chat_member(chat_id)
);

-- ---------------------------------------------------------------------------
-- 5. Privileges
-- ---------------------------------------------------------------------------
revoke all on public.leads from anon, authenticated;
revoke all on public.lead_history from anon, authenticated;
revoke all on public.tasks from anon, authenticated;
revoke all on public.task_comments from anon, authenticated;
revoke all on public.chats from anon, authenticated;
revoke all on public.chat_members from anon, authenticated;
revoke all on public.chat_messages from anon, authenticated;

grant select, insert, update on public.leads to authenticated;
grant select, insert on public.lead_history to authenticated;
grant select, insert, update on public.tasks to authenticated;
grant select, insert on public.task_comments to authenticated;
grant select on public.chats to authenticated;
grant select on public.chat_members to authenticated;
grant update (last_read_at) on public.chat_members to authenticated;
grant select, insert on public.chat_messages to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Commands
-- ---------------------------------------------------------------------------
-- Chat and members in one transaction. Every member must belong to the
-- workspace; a client may only address staff; a chat never mixes clients of
-- different client companies.
create or replace function public.create_chat(
  p_workspace_id uuid,
  p_name text,
  p_is_group boolean,
  p_members uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor uuid := auth.uid();
  v_actor_is_staff boolean;
  v_members uuid[];
  v_member uuid;
  v_chat uuid;
  v_companies int;
begin
  if v_actor is null then
    raise exception 'authentication required';
  end if;
  if not public.is_workspace_member(p_workspace_id) then
    raise exception 'workspace membership required';
  end if;
  if not public.has_module_entitlement(p_workspace_id, 'chats') then
    raise exception 'chats module is not enabled';
  end if;

  select array_agg(distinct m) into v_members
  from unnest(coalesce(p_members, array[]::uuid[]) || v_actor) as m;
  if array_length(v_members, 1) < 2 then
    raise exception 'a chat needs at least one other member';
  end if;
  if array_length(v_members, 1) > 100 then
    raise exception 'too many members';
  end if;

  v_actor_is_staff := public.is_workspace_staff_user(p_workspace_id, v_actor);

  foreach v_member in array v_members loop
    if not public.is_active_workspace_user(p_workspace_id, v_member) then
      raise exception 'every member must belong to the workspace';
    end if;
    if not v_actor_is_staff and v_member <> v_actor
       and not public.is_workspace_staff_user(p_workspace_id, v_member) then
      raise exception 'a client can only start a chat with staff';
    end if;
  end loop;

  select count(distinct membership.client_company_id) into v_companies
  from public.workspace_memberships membership
  where membership.workspace_id = p_workspace_id
    and membership.user_id = any(v_members)
    and membership.status = 'active'
    and membership.role = 'client'
    and not public.is_workspace_staff_user(p_workspace_id, membership.user_id);
  if v_companies > 1 then
    raise exception 'a chat cannot mix clients of different client companies';
  end if;

  insert into public.chats (workspace_id, name, is_group, created_by)
  values (p_workspace_id, left(coalesce(btrim(p_name), ''), 120), coalesce(p_is_group, false), v_actor)
  returning id into v_chat;

  insert into public.chat_members (chat_id, user_id, added_by)
  select v_chat, m, v_actor from unnest(v_members) as m;

  return v_chat;
end
$function$;

create or replace function public.unread_messages()
returns int
language sql
security definer
set search_path = ''
stable
as $function$
  select coalesce(count(*), 0)::int
  from public.chat_messages message
  join public.chat_members member
    on member.chat_id = message.chat_id and member.user_id = auth.uid()
  where message.created_at > member.last_read_at
    and message.sender_id <> auth.uid()
    and public.is_chat_member(message.chat_id)
$function$;

-- The client's answer to an offer. Security invoker on purpose: the row
-- policy and orders_scope_guard() decide, not this function.
create or replace function public.decide_order(p_order_id uuid, p_decision text)
returns void
language plpgsql
security invoker
set search_path = ''
as $function$
begin
  if p_decision not in ('approved', 'rejected') then
    raise exception 'decision must be approved or rejected';
  end if;
  update public.orders
     set status = p_decision,
         client_decision = p_decision,
         client_decision_at = now()
   where id = p_order_id and status = 'offer_sent';
  if not found then
    raise exception 'offer is not awaiting a decision';
  end if;
end
$function$;

-- ---------------------------------------------------------------------------
-- 7. Explicit legacy backfill (owner path only)
-- ---------------------------------------------------------------------------
create or replace function public.legacy_assign_work_scope(
  p_object_type text,
  p_object_id uuid,
  p_workspace_id uuid,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_found boolean := false;
begin
  if char_length(btrim(coalesce(p_reason, ''))) < 3 then
    raise exception 'reason is required';
  end if;
  if not exists (select 1 from public.tenant_workspaces where id = p_workspace_id) then
    raise exception 'workspace not found';
  end if;

  perform set_config('exim.legacy_backfill', 'on', true);

  if p_object_type = 'lead' then
    update public.leads set workspace_id = p_workspace_id
     where id = p_object_id and workspace_id is null;
    v_found := found;
    update public.lead_history set workspace_id = p_workspace_id
     where lead_id = p_object_id and workspace_id is null;
  elsif p_object_type = 'task' then
    update public.tasks set workspace_id = p_workspace_id
     where id = p_object_id and workspace_id is null;
    v_found := found;
    update public.task_comments set workspace_id = p_workspace_id
     where task_id = p_object_id and workspace_id is null;
  elsif p_object_type = 'chat' then
    update public.chats set workspace_id = p_workspace_id
     where id = p_object_id and workspace_id is null;
    v_found := found;
    update public.chat_messages set workspace_id = p_workspace_id
     where chat_id = p_object_id and workspace_id is null;
  else
    raise exception 'object type must be lead, task or chat';
  end if;

  perform set_config('exim.legacy_backfill', 'off', true);

  if not v_found then
    raise exception '% not found or already scoped', p_object_type;
  end if;

  insert into public.tenant_audit_events (
    workspace_id, actor_user_id, action, object_type, object_id, reason
  ) values (
    p_workspace_id, auth.uid(), 'legacy.work_scope_assigned', p_object_type,
    p_object_id::text, btrim(p_reason)
  );
end
$function$;

revoke all on function public.is_active_workspace_user(uuid, uuid) from public, anon, authenticated;
revoke all on function public.is_workspace_staff_user(uuid, uuid) from public, anon;
revoke all on function public.is_chat_member(uuid) from public, anon;
revoke all on function public.can_read_task(uuid) from public, anon;
revoke all on function public.workspace_directory(uuid) from public, anon;
revoke all on function public.create_chat(uuid, text, boolean, uuid[]) from public, anon;
revoke all on function public.unread_messages() from public, anon;
revoke all on function public.decide_order(uuid, text) from public, anon;
grant execute on function public.is_workspace_staff_user(uuid, uuid) to authenticated;
grant execute on function public.is_chat_member(uuid) to authenticated;
grant execute on function public.can_read_task(uuid) to authenticated;
grant execute on function public.workspace_directory(uuid) to authenticated;
grant execute on function public.create_chat(uuid, text, boolean, uuid[]) to authenticated;
grant execute on function public.unread_messages() to authenticated;
grant execute on function public.decide_order(uuid, text) to authenticated;

revoke all on function public.legacy_assign_work_scope(text, uuid, uuid, text)
  from public, anon, authenticated;
revoke all on function public.work_scope_guard() from public, anon, authenticated;
revoke all on function public.inherit_parent_scope() from public, anon, authenticated;
revoke all on function public.tasks_scope_guard() from public, anon, authenticated;

commit;
