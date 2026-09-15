-- ============================================================
-- EXIM: чаты (личные и группы) + задачи (стиль Битрикс24)
-- Выполнить в Supabase → SQL Editor → Run
-- ============================================================

-- ---------- ЧАТЫ ----------
create table if not exists public.chats (
  id         uuid primary key default gen_random_uuid(),
  name       text not null default '',
  is_group   boolean not null default false,
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now()
);
create table if not exists public.chat_members (
  chat_id  uuid not null references public.chats (id) on delete cascade,
  user_id  uuid not null references public.profiles (id) on delete cascade,
  added_by uuid,
  joined_at timestamptz not null default now(),
  primary key (chat_id, user_id)
);
create table if not exists public.chat_messages (
  id         bigint generated always as identity primary key,
  chat_id    uuid not null references public.chats (id) on delete cascade,
  sender_id  uuid not null references public.profiles (id),
  text       text not null,
  created_at timestamptz not null default now()
);

create or replace function public.is_chat_member(p_chat uuid)
returns boolean language sql security definer set search_path = public stable
as $f$ select exists (select 1 from public.chat_members where chat_id = p_chat and user_id = auth.uid()) $f$;

alter table public.chats enable row level security;
alter table public.chat_members enable row level security;
alter table public.chat_messages enable row level security;

drop policy if exists "chats member read" on public.chats;
create policy "chats member read" on public.chats for select
  using (public.is_chat_member(id) or created_by = auth.uid());
drop policy if exists "chats create" on public.chats;
create policy "chats create" on public.chats for insert with check (created_by = auth.uid());

drop policy if exists "members read" on public.chat_members;
create policy "members read" on public.chat_members for select using (public.is_chat_member(chat_id));
drop policy if exists "members add" on public.chat_members;
create policy "members add" on public.chat_members for insert with check (
  -- создатель чата добавляет участников; каждый может добавить себя при создании
  exists (select 1 from public.chats c where c.id = chat_id and c.created_by = auth.uid())
  or user_id = auth.uid()
);

drop policy if exists "messages read" on public.chat_messages;
create policy "messages read" on public.chat_messages for select using (public.is_chat_member(chat_id));
drop policy if exists "messages send" on public.chat_messages;
create policy "messages send" on public.chat_messages for insert with check (
  sender_id = auth.uid() and public.is_chat_member(chat_id)
);

-- realtime для сообщений
do $$ begin
  alter publication supabase_realtime add table public.chat_messages;
exception when duplicate_object then null; end $$;

-- Клиенты должны видеть сотрудников (для чата и задач)
drop policy if exists "profiles staff visible" on public.profiles;
create policy "profiles staff visible" on public.profiles for select
  using (role in ('manager','logist','admin'));

-- ---------- ЗАДАЧИ ----------
create table if not exists public.tasks (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  description text default '',
  creator_id  uuid not null references public.profiles (id),
  assignee_id uuid not null references public.profiles (id),
  deadline    timestamptz,
  priority    text not null default 'normal' check (priority in ('low','normal','high')),
  status      text not null default 'new' check (status in ('new','in_progress','review','done','deferred')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create table if not exists public.task_comments (
  id         bigint generated always as identity primary key,
  task_id    uuid not null references public.tasks (id) on delete cascade,
  author_id  uuid not null references public.profiles (id),
  text       text not null,
  created_at timestamptz not null default now()
);

drop trigger if exists trg_tasks_touch on public.tasks;
create trigger trg_tasks_touch before update on public.tasks
  for each row execute function public.touch_updated_at();

alter table public.tasks enable row level security;
alter table public.task_comments enable row level security;

drop policy if exists "tasks read" on public.tasks;
create policy "tasks read" on public.tasks for select
  using (creator_id = auth.uid() or assignee_id = auth.uid() or public.is_manager());
drop policy if exists "tasks create" on public.tasks;
create policy "tasks create" on public.tasks for insert with check (creator_id = auth.uid());
drop policy if exists "tasks update" on public.tasks;
create policy "tasks update" on public.tasks for update
  using (creator_id = auth.uid() or assignee_id = auth.uid() or public.is_manager());

drop policy if exists "task comments read" on public.task_comments;
create policy "task comments read" on public.task_comments for select using (
  exists (select 1 from public.tasks t where t.id = task_id
          and (t.creator_id = auth.uid() or t.assignee_id = auth.uid() or public.is_manager()))
);
drop policy if exists "task comments write" on public.task_comments;
create policy "task comments write" on public.task_comments for insert with check (
  author_id = auth.uid() and exists (select 1 from public.tasks t where t.id = task_id
          and (t.creator_id = auth.uid() or t.assignee_id = auth.uid() or public.is_manager()))
);

select 'CHATS AND TASKS OK' as result;
