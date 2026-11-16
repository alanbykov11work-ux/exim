-- TASK-2026-001 production cutover: assign existing (legacy) rows to a scope WITHOUT changing who sees what.
-- Owner authorization 2026-11-13 (PR #8); mapping approved by Alan 2026-11-16 ("перенос как есть"):
--   * one organization + one workspace for EXIM staff;
--   * every legacy staff profile (profiles.role <> 'client') -> workspace member 'tenant_admin' (today they are all 'admin');
--   * every legacy client -> its OWN client company (no merging by typed company name; can be merged later by an admin);
--   * every order -> workspace + the client company of orders.client_id; chats/tasks/leads -> the workspace.
-- Idempotent: fixed ids, "on conflict do nothing", only rows with workspace_id is null are touched.
-- Runs as the migration owner (auth.uid() is null in audit rows).
do $$
declare
  v_org constant uuid := 'e1000000-0000-4000-8000-000000000001';
  v_ws  constant uuid := 'e2000000-0000-4000-8000-000000000001';
  r record; v_company uuid;
begin
  insert into public.organizations(id, name, slug) values (v_org, 'EXIM', 'exim') on conflict do nothing;
  insert into public.tenant_workspaces(id, organization_id, name, slug) values (v_ws, v_org, 'EXIM', 'exim') on conflict do nothing;
  insert into public.module_entitlements(workspace_id, module_code, enabled) values (v_ws, 'private_os', true) on conflict do nothing;

  for r in select id from public.profiles where coalesce(role, 'client') <> 'client' loop
    insert into public.workspace_memberships(workspace_id, user_id, role, client_company_id)
    values (v_ws, r.id, 'tenant_admin', null) on conflict do nothing;
  end loop;

  for r in select p.id, p.company, p.full_name, p.email from public.profiles p where coalesce(p.role, 'client') = 'client' loop
    v_company := ('e3' || substr(md5(r.id::text), 3, 30))::uuid;
    insert into public.client_companies(id, workspace_id, name)
    values (v_company, v_ws, coalesce(nullif(btrim(r.company), ''), nullif(btrim(r.full_name), ''), r.email, 'Клиент'))
    on conflict do nothing;
    insert into public.workspace_memberships(workspace_id, user_id, role, client_company_id)
    values (v_ws, r.id, 'client', v_company) on conflict do nothing;
  end loop;

  for r in select o.id, o.client_id from public.orders o where o.workspace_id is null loop
    perform public.legacy_assign_order_scope(r.id, v_ws, ('e3' || substr(md5(r.client_id::text), 3, 30))::uuid,
      'TASK-2026-001 production cutover: legacy order kept with its client');
  end loop;
  for r in select id from public.chats where workspace_id is null loop
    perform public.legacy_assign_work_scope('chat', r.id, v_ws, 'TASK-2026-001 production cutover');
  end loop;
  for r in select id from public.tasks where workspace_id is null loop
    perform public.legacy_assign_work_scope('task', r.id, v_ws, 'TASK-2026-001 production cutover');
  end loop;
  for r in select id from public.leads where workspace_id is null loop
    perform public.legacy_assign_work_scope('lead', r.id, v_ws, 'TASK-2026-001 production cutover');
  end loop;
end $$;
