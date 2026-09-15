-- ============================================================
-- Умные номера перевозок: ММ-ЛЛ-НН-0001
-- ММ — код менеджера, ЛЛ — код логиста, НН — код направления, 0001 — порядок
-- ============================================================

-- Персональные коды сотрудников
alter table public.profiles add column if not exists staff_code int;

-- Автовыдача кода сотруднику (при первом использовании)
create or replace function public.ensure_staff_code(p_user uuid)
returns int language plpgsql security definer set search_path = public as $$
declare c int;
begin
  select staff_code into c from public.profiles where id = p_user;
  if c is not null then return c; end if;
  select coalesce(max(staff_code), 0) + 1 into c from public.profiles;
  update public.profiles set staff_code = c where id = p_user;
  return c;
end; $$;

-- Выдать коды текущим сотрудникам по порядку регистрации
do $$
declare r record; n int := coalesce((select max(staff_code) from public.profiles), 0);
begin
  for r in select id from public.profiles
           where role in ('manager','logist','admin') and staff_code is null
           order by created_at loop
    n := n + 1;
    update public.profiles set staff_code = n where id = r.id;
  end loop;
end $$;

-- Сквозной счётчик перевозок
create sequence if not exists public.transport_seq start 1;

-- Генерация номера
create or replace function public.gen_transport_ref(p_manager uuid, p_logist uuid, p_direction text)
returns text language plpgsql security definer set search_path = public as $$
declare m int; l int; n bigint;
begin
  if not (public.is_manager() or public.is_logist()) then
    raise exception 'staff only';
  end if;
  m := coalesce(public.ensure_staff_code(p_manager), 0);
  l := case when p_logist is null then 0 else coalesce(public.ensure_staff_code(p_logist), 0) end;
  n := nextval('public.transport_seq');
  return lpad(m::text, 2, '0') || '-' || lpad(l::text, 2, '0') || '-' ||
         coalesce(nullif(p_direction, ''), '90') || '-' || lpad(n::text, 4, '0');
end; $$;

grant execute on function public.gen_transport_ref(uuid, uuid, text) to authenticated;
grant execute on function public.ensure_staff_code(uuid) to authenticated;

-- Смена кода сотрудника (только админ)
create or replace function public.admin_set_code(p_user uuid, p_code int)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'admin only'; end if;
  if exists (select 1 from public.profiles where staff_code = p_code and id <> p_user) then
    raise exception 'code already taken';
  end if;
  update public.profiles set staff_code = p_code where id = p_user;
end; $$;
grant execute on function public.admin_set_code(uuid, int) to authenticated;

select 'SMART REF OK' as result;
