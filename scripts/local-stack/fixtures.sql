-- Synthetic fixtures for a disposable database: 2 tenants, 3 client companies, 7 accounts.
-- No real people, no passwords (local JWTs are minted for these ids only).
insert into auth.users(id, email) values
 ('a0000000-0000-4000-8000-000000000001','client.a1@example.test'),
 ('a0000000-0000-4000-8000-000000000002','client.a2@example.test'),
 ('a0000000-0000-4000-8000-000000000003','manager.a@example.test'),
 ('a0000000-0000-4000-8000-000000000004','logist.a@example.test'),
 ('a0000000-0000-4000-8000-000000000005','admin.a@example.test'),
 ('a0000000-0000-4000-8000-000000000006','client.b1@example.test'),
 ('a0000000-0000-4000-8000-000000000007','admin.b@example.test')
on conflict do nothing;
insert into public.profiles(id, email) select id, email from auth.users on conflict (id) do nothing;
insert into public.organizations(id, name, slug) values
 ('b0000000-0000-4000-8000-000000000001','Tenant A','tenant-a'),('b0000000-0000-4000-8000-000000000002','Tenant B','tenant-b') on conflict do nothing;
insert into public.tenant_workspaces(id, organization_id, name, slug) values
 ('c0000000-0000-4000-8000-000000000001','b0000000-0000-4000-8000-000000000001','WS A','ws-a'),
 ('c0000000-0000-4000-8000-000000000002','b0000000-0000-4000-8000-000000000002','WS B','ws-b') on conflict do nothing;
insert into public.client_companies(id, workspace_id, name) values
 ('d0000000-0000-4000-8000-000000000001','c0000000-0000-4000-8000-000000000001','Company A1'),
 ('d0000000-0000-4000-8000-000000000002','c0000000-0000-4000-8000-000000000001','Company A2'),
 ('d0000000-0000-4000-8000-000000000003','c0000000-0000-4000-8000-000000000002','Company B1') on conflict do nothing;
insert into public.workspace_memberships(workspace_id, user_id, role, client_company_id) values
 ('c0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000001','client','d0000000-0000-4000-8000-000000000001'),
 ('c0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000002','client','d0000000-0000-4000-8000-000000000002'),
 ('c0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000003','manager',null),
 ('c0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000004','logistician',null),
 ('c0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000005','tenant_admin',null),
 ('c0000000-0000-4000-8000-000000000002','a0000000-0000-4000-8000-000000000006','client','d0000000-0000-4000-8000-000000000003'),
 ('c0000000-0000-4000-8000-000000000002','a0000000-0000-4000-8000-000000000007','tenant_admin',null)
on conflict do nothing;
insert into public.module_entitlements(workspace_id, module_code, enabled) values
 ('c0000000-0000-4000-8000-000000000001','private_os',true),('c0000000-0000-4000-8000-000000000002','private_os',true)
on conflict do nothing;
-- display data used by the UI lists (authority stays in workspace_memberships)
update public.profiles set role = 'manager', full_name = 'Менеджер A' where id = 'a0000000-0000-4000-8000-000000000003';
update public.profiles set role = 'logist', full_name = 'Логист A' where id = 'a0000000-0000-4000-8000-000000000004';
update public.profiles set full_name = 'Клиент A1', company = 'Company A1' where id = 'a0000000-0000-4000-8000-000000000001';
