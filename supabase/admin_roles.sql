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

-- Выдать админа трём аккаунтам
update public.profiles set role = 'admin'
 where email in ('morgiytgamer@gmail.com','alanbykov11work@gmail.com','alanamirkhan11@gmail.com');

select email, role from public.profiles order by role;
