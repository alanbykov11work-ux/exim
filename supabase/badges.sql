-- Плашки непрочитанного: отметка «прочитано до» и счётчик
alter table public.chat_members add column if not exists last_read_at timestamptz not null default now();

drop policy if exists "members update own" on public.chat_members;
create policy "members update own" on public.chat_members for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create or replace function public.unread_messages()
returns int language sql security definer set search_path = public stable as $$
  select coalesce(count(*), 0)::int
  from public.chat_messages m
  join public.chat_members cm on cm.chat_id = m.chat_id and cm.user_id = auth.uid()
  where m.created_at > cm.last_read_at and m.sender_id <> auth.uid();
$$;
grant execute on function public.unread_messages() to authenticated;

select 'BADGES OK' as result;
