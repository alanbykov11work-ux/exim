import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const ids = {
  orgA: "10000000-0000-4000-8000-000000000001",
  orgB: "10000000-0000-4000-8000-000000000002",
  workspaceA: "20000000-0000-4000-8000-000000000001",
  workspaceB: "20000000-0000-4000-8000-000000000002",
  companyA1: "30000000-0000-4000-8000-000000000001",
  companyA2: "30000000-0000-4000-8000-000000000002",
  companyB1: "30000000-0000-4000-8000-000000000003",
  clientA1: "40000000-0000-4000-8000-000000000001",
  clientA2: "40000000-0000-4000-8000-000000000002",
  managerA: "40000000-0000-4000-8000-000000000003",
  adminA: "40000000-0000-4000-8000-000000000004",
  clientB1: "40000000-0000-4000-8000-000000000005",
  adminB: "40000000-0000-4000-8000-000000000006",
};

async function createDatabase() {
  const db = new PGlite();
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create schema auth;
    create table auth.users (id uuid primary key);
    create or replace function auth.uid()
    returns uuid language sql stable
    as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;

    create table public.profiles (
      id uuid primary key references auth.users(id),
      email text,
      full_name text,
      company text,
      phone text,
      bin text,
      role text not null default 'client',
      verified boolean not null default false
    );
    alter table public.profiles enable row level security;
    grant select on public.profiles to authenticated;

    create or replace function public.touch_updated_at()
    returns trigger language plpgsql as $$
    begin
      new.updated_at = now();
      return new;
    end
    $$;

    create or replace function public.admin_set_role(p_user uuid, p_role text)
    returns void language plpgsql security definer set search_path = public as $$
    begin
      update public.profiles set role = p_role where id = p_user;
    end
    $$;
    grant execute on function public.admin_set_role(uuid, text) to authenticated;
  `);

  const migration = await readFile(
    new URL("../supabase/foundation_wave_1.sql", import.meta.url),
    "utf8"
  );
  await db.exec(migration);
  return db;
}

async function provisionFixture(db) {
  const userIds = [
    ids.clientA1,
    ids.clientA2,
    ids.managerA,
    ids.adminA,
    ids.clientB1,
    ids.adminB,
  ];
  for (const id of userIds) {
    await db.query("insert into auth.users(id) values ($1)", [id]);
    await db.query(
      "insert into public.profiles(id, email, full_name) values ($1, $2, $3)",
      [id, `${id.slice(-4)}@test.invalid`, id]
    );
  }

  await db.query(
    "insert into public.organizations(id, name, slug) values ($1, 'Org A', 'org-a'), ($2, 'Org B', 'org-b')",
    [ids.orgA, ids.orgB]
  );
  await db.query(
    "insert into public.tenant_workspaces(id, organization_id, name, slug) values ($1, $2, 'Workspace A', 'workspace-a'), ($3, $4, 'Workspace B', 'workspace-b')",
    [ids.workspaceA, ids.orgA, ids.workspaceB, ids.orgB]
  );
  await db.query(
    "insert into public.client_companies(id, workspace_id, name) values ($1, $2, 'A1'), ($3, $2, 'A2'), ($4, $5, 'B1')",
    [ids.companyA1, ids.workspaceA, ids.companyA2, ids.companyB1, ids.workspaceB]
  );
  await db.query(
    `insert into public.workspace_memberships(workspace_id, user_id, role, client_company_id)
     values
       ($1, $2, 'client', $3),
       ($1, $4, 'client', $5),
       ($1, $6, 'manager', null),
       ($1, $7, 'tenant_admin', null),
       ($8, $9, 'client', $10),
       ($8, $11, 'tenant_admin', null)`,
    [
      ids.workspaceA,
      ids.clientA1,
      ids.companyA1,
      ids.clientA2,
      ids.companyA2,
      ids.managerA,
      ids.adminA,
      ids.workspaceB,
      ids.clientB1,
      ids.companyB1,
      ids.adminB,
    ]
  );
  await db.query(
    "insert into public.organization_capabilities(organization_id, code) values ($1, 'cargo_publisher'), ($1, 'transport_publisher')",
    [ids.orgA]
  );
}

async function assumeUser(db, userId) {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [userId]);
  await db.exec("set role authenticated");
}

test("Wave 1 SQL executes and isolates tenants and client companies", async (t) => {
  const db = await createDatabase();
  t.after(() => db.close());
  await provisionFixture(db);

  await assumeUser(db, ids.clientA1);
  const clientCompanies = await db.query(
    "select name from public.client_companies order by name"
  );
  assert.deepEqual(clientCompanies.rows.map((row) => row.name), ["A1"]);

  const clientProfiles = await db.query("select id from public.profiles order by id");
  assert.deepEqual(clientProfiles.rows.map((row) => row.id), [ids.clientA1]);

  await assumeUser(db, ids.managerA);
  const managerCompanies = await db.query(
    "select name from public.client_companies order by name"
  );
  assert.deepEqual(managerCompanies.rows.map((row) => row.name), ["A1", "A2"]);

  const managerProfiles = await db.query("select id from public.profiles order by id");
  assert.deepEqual(
    managerProfiles.rows.map((row) => row.id),
    [ids.clientA1, ids.clientA2, ids.managerA, ids.adminA].sort()
  );

  await assumeUser(db, ids.clientB1);
  const tenantBCompanies = await db.query(
    "select name from public.client_companies order by name"
  );
  assert.deepEqual(tenantBCompanies.rows.map((row) => row.name), ["B1"]);
});

test("tenant admin RPC is scoped, audited and cannot remove the last admin", async (t) => {
  const db = await createDatabase();
  t.after(() => db.close());
  await provisionFixture(db);

  await assumeUser(db, ids.adminA);
  await db.query(
    "select public.tenant_admin_upsert_membership($1, $2, 'manager', null, 'active', 'test assignment')",
    [ids.workspaceA, ids.clientA1]
  );
  const ownAudit = await db.query(
    "select action from public.tenant_audit_events order by id"
  );
  assert.deepEqual(ownAudit.rows.map((row) => row.action), ["membership.created"]);

  await assert.rejects(
    db.query(
      "select public.tenant_admin_upsert_membership($1, $2, 'manager', null, 'active', 'cross tenant')",
      [ids.workspaceB, ids.clientA2]
    ),
    /tenant_admin role required/
  );

  await assert.rejects(
    db.query(
      "select public.tenant_admin_upsert_membership($1, $2, 'tenant_admin', null, 'suspended', 'remove last admin')",
      [ids.workspaceA, ids.adminA]
    ),
    /cannot suspend the last tenant admin/
  );
});
