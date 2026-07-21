-- ============================================================
-- EXIM Super App — схема базы данных (Supabase / Postgres)
-- Выполните этот файл целиком в Supabase → SQL Editor → Run
-- ============================================================

-- ---------- Профили пользователей ----------
create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text,
  full_name   text,
  company     text,
  phone       text,
  bin         text,                          -- БИН/ИИН компании
  role        text not null default 'client'
              check (role in ('client', 'manager', 'logist', 'admin')),
  verified    boolean not null default false, -- ручная проверка компании менеджером (KYC)
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Вспомогательные функции (security definer — обходят RLS, иначе рекурсия)
create or replace function public.is_staff()
returns boolean language sql security definer set search_path = public stable
as $f$ select exists (select 1 from public.profiles where id = auth.uid() and role in ('manager','logist','admin')) $f$;

create or replace function public.own_role()
returns text language sql security definer set search_path = public stable
as $f$ select role from public.profiles where id = auth.uid() $f$;

create or replace function public.own_verified()
returns boolean language sql security definer set search_path = public stable
as $f$ select verified from public.profiles where id = auth.uid() $f$;

-- Пользователь видит и правит только свой профиль;
-- менеджеры/админы видят все профили (для верификации клиентов).
drop policy if exists "profiles: read own or staff" on public.profiles;
create policy "profiles: read own or staff"
  on public.profiles for select
  using (auth.uid() = id or public.is_staff());

drop policy if exists "profiles: update own" on public.profiles;
create policy "profiles: update own"
  on public.profiles for update
  using (auth.uid() = id)
  -- роль и флаг verified пользователь сам менять не может
  with check (auth.uid() = id and role = public.own_role() and verified = public.own_verified());

-- ---------- Автосоздание профиля при регистрации ----------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, company, phone, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    coalesce(new.raw_user_meta_data ->> 'company', ''),
    coalesce(new.raw_user_meta_data ->> 'phone', ''),
    'client'  -- роль при самостоятельной регистрации всегда client;
              -- менеджеров/логистов назначает админ UPDATE-ом в этой таблице
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- Данные приложения (синхронизация состояния) ----------
-- Каждый ключ состояния приложения (перевозки, чаты, уведомления, задачи...)
-- хранится отдельной строкой JSONB на пользователя.
create table if not exists public.user_state (
  user_id     uuid not null references auth.users (id) on delete cascade,
  key         text not null,
  value       jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now(),
  primary key (user_id, key)
);

alter table public.user_state enable row level security;

create policy "user_state: full access to own rows"
  on public.user_state for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ---------- updated_at автообновление ----------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_profiles_touch on public.profiles;
create trigger trg_profiles_touch
  before update on public.profiles
  for each row execute function public.touch_updated_at();

drop trigger if exists trg_user_state_touch on public.user_state;
create trigger trg_user_state_touch
  before update on public.user_state
  for each row execute function public.touch_updated_at();

-- ============================================================
-- Как назначить сотрудника (менеджер / логист / админ):
--   update public.profiles set role = 'manager' where email = 'manager@exim.kz';
-- Как отметить компанию клиента как проверенную (KYC):
--   update public.profiles set verified = true where email = 'client@company.kz';
-- ============================================================
