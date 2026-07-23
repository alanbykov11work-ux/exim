-- Защита от перебора пароля и рейт-лимиты
create table if not exists public.rate_limits (
  key          text primary key,
  fails        int not null default 0,
  window_start timestamptz not null default now(),
  locked_until timestamptz,
  updated_at   timestamptz not null default now()
);
alter table public.rate_limits enable row level security;
-- политик нет: таблица доступна только функциям security definer

create or replace function public.rate_status(p_key text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r public.rate_limits;
begin
  select * into r from public.rate_limits where key = p_key;
  if r.key is null then return jsonb_build_object('locked', false, 'fails', 0); end if;
  if r.locked_until is not null and r.locked_until > now() then
    return jsonb_build_object('locked', true,
      'retry_after', ceil(extract(epoch from (r.locked_until - now())))::int, 'fails', r.fails);
  end if;
  return jsonb_build_object('locked', false, 'fails',
    case when r.window_start > now() - interval '30 minutes' then r.fails else 0 end);
end; $$;

create or replace function public.rate_fail(p_key text, p_max int, p_window_sec int, p_lock_sec int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r public.rate_limits; new_fails int;
begin
  select * into r from public.rate_limits where key = p_key for update;
  if r.key is null then
    insert into public.rate_limits (key, fails, window_start) values (p_key, 1, now());
    return jsonb_build_object('locked', false, 'fails', 1);
  end if;
  if r.locked_until is not null and r.locked_until > now() then
    return jsonb_build_object('locked', true,
      'retry_after', ceil(extract(epoch from (r.locked_until - now())))::int);
  end if;
  if r.window_start < now() - make_interval(secs => p_window_sec) then
    new_fails := 1;
    update public.rate_limits set fails = 1, window_start = now(), locked_until = null, updated_at = now() where key = p_key;
  else
    new_fails := r.fails + 1;
    update public.rate_limits set fails = new_fails, updated_at = now() where key = p_key;
  end if;
  if new_fails >= p_max then
    update public.rate_limits set locked_until = now() + make_interval(secs => p_lock_sec), updated_at = now() where key = p_key;
    return jsonb_build_object('locked', true, 'retry_after', p_lock_sec);
  end if;
  return jsonb_build_object('locked', false, 'fails', new_fails, 'left', p_max - new_fails);
end; $$;

-- Сброс счётчика: только сам пользователь после успешного входа, только свой ключ
create or replace function public.rate_clear(p_key text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'auth required'; end if;
  if p_key not like 'login:' || (select lower(email) from public.profiles where id = auth.uid()) || ':%' then
    raise exception 'not allowed';
  end if;
  delete from public.rate_limits where key = p_key;
end; $$;

revoke all on public.rate_limits from anon, authenticated;
grant execute on function public.rate_status(text) to anon, authenticated;
grant execute on function public.rate_fail(text, int, int, int) to anon, authenticated;
grant execute on function public.rate_clear(text) to authenticated;

select 'RATE LIMIT OK' as result;
