-- Админы и смена ролей из приложения
create or replace function public.is_admin()
returns boolean language sql security definer set search_path = public stable
as $f$ select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin') $f$;

-- Смена роли: только админ; нельзя снять с себя админа, если ты последний
create or replace function public.admin_set_role(p_user uuid, p_role text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'only admin can change roles';
  end if;
  if p_role not in ('client','manager','logist','admin') then
    raise exception 'invalid role';
  end if;
  if p_user = auth.uid() and p_role <> 'admin'
     and (select count(*) from public.profiles where role = 'admin') <= 1 then
    raise exception 'cannot demote the last admin';
  end if;
  update public.profiles set role = p_role where id = p_user;
end; $$;

revoke all on function public.admin_set_role(uuid, text) from public;
grant execute on function public.admin_set_role(uuid, text) to authenticated;

-- ------------------------------------------------------------
-- Назначение первого администратора
--
-- Конкретные адреса в репозитории не хранятся: это персональные данные,
-- и любой, кто читает публичный репозиторий, получал бы готовый список
-- целей для атаки на аккаунты с максимальными правами.
--
-- Первому администратору роль выдаётся однократно вручную в Supabase
-- SQL Editor. Подставьте адрес нужного аккаунта и выполните:
--
--   select public.grant_admin('admin@example.com');
--
-- Дальше роли меняются только из приложения через admin_set_role(),
-- и каждое изменение попадает в аудит.
-- ------------------------------------------------------------
create or replace function public.grant_admin(p_email text)
returns text language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_admins int;
begin
  select count(*) into v_admins from public.profiles where role = 'admin';

  -- После появления первого администратора функция закрывается:
  -- дальнейшие назначения идут только через admin_set_role() от админа.
  if v_admins > 0 and not public.is_admin() then
    raise exception 'администратор уже назначен — используйте admin_set_role()';
  end if;

  select id into v_id from public.profiles where lower(email) = lower(btrim(p_email));
  if v_id is null then
    raise exception 'пользователь с таким email не найден: сначала он должен зарегистрироваться';
  end if;

  update public.profiles set role = 'admin' where id = v_id;
  return 'admin granted';
end; $$;

-- Вызывать может только владелец проекта из SQL Editor либо действующий админ.
revoke all on function public.grant_admin(text) from public, anon, authenticated;

select 'ADMIN ROLES OK' as result;
