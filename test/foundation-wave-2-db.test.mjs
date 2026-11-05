import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const ids = {
  org: "10000000-0000-4000-8000-000000000001",
  orgB: "10000000-0000-4000-8000-000000000002",
  ws: "20000000-0000-4000-8000-000000000001",
  wsB: "20000000-0000-4000-8000-000000000002",
  a1: "30000000-0000-4000-8000-000000000001",
  a2: "30000000-0000-4000-8000-000000000002",
  b1: "30000000-0000-4000-8000-000000000003",
  clientA1: "40000000-0000-4000-8000-000000000001",
  clientA2: "40000000-0000-4000-8000-000000000002",
  manager: "40000000-0000-4000-8000-000000000003",
  clientB1: "40000000-0000-4000-8000-000000000004",
};
const sqlFile = (name) => readFile(new URL(`../supabase/${name}`, import.meta.url), "utf8");

async function as(db, user) {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [user]);
  await db.exec("set role authenticated");
}

test("search by number finds only what the caller may open", async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create schema auth;
    create table auth.users (id uuid primary key);
    create or replace function auth.uid() returns uuid language sql stable
      as $$ select coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''), (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'))::uuid $$;
    create table public.profiles (id uuid primary key references auth.users(id), email text,
      full_name text, company text, phone text, bin text, role text not null default 'client',
      verified boolean not null default false);
    alter table public.profiles enable row level security;
    create or replace function public.touch_updated_at() returns trigger language plpgsql
      as $$ begin new.updated_at = now(); return new; end $$;
    create or replace function public.admin_set_role(p_user uuid, p_role text)
      returns void language sql as $$ select 1 $$;
  `);
  for (const f of ["workflow.sql", "foundation_wave_1.sql", "foundation_wave_1b_legacy_scope.sql", "foundation_wave_2_shell.sql"]) {
    await db.exec(await sqlFile(f));
  }
  for (const id of [ids.clientA1, ids.clientA2, ids.manager, ids.clientB1]) {
    await db.query("insert into auth.users values ($1)", [id]);
    await db.query("insert into public.profiles(id) values ($1)", [id]);
  }
  await db.query("insert into public.organizations(id, name, slug) values ($1,'A','org-a'),($2,'B','org-b')", [ids.org, ids.orgB]);
  await db.query("insert into public.tenant_workspaces(id, organization_id, name, slug) values ($1,$2,'A','ws-a'),($3,$4,'B','ws-b')", [ids.ws, ids.org, ids.wsB, ids.orgB]);
  await db.query("insert into public.client_companies(id, workspace_id, name) values ($1,$2,'A1'),($3,$2,'A2'),($4,$5,'B1')", [ids.a1, ids.ws, ids.a2, ids.b1, ids.wsB]);
  await db.query(
    `insert into public.workspace_memberships(workspace_id, user_id, role, client_company_id) values
     ($1,$2,'client',$3),($1,$4,'client',$5),($1,$6,'manager',null),($7,$8,'client',$9)`,
    [ids.ws, ids.clientA1, ids.a1, ids.clientA2, ids.a2, ids.manager, ids.wsB, ids.clientB1, ids.b1]
  );
  await db.query("insert into public.module_entitlements values ($1,'private_os',true),($2,'private_os',true)", [ids.ws, ids.wsB]);

  await as(db, ids.clientA1);
  const { rows } = await db.query(
    `insert into public.orders(ref, client_id, created_by, origin, destination, workspace_id, client_company_id)
     values ('ZK-1042', $1, $1, 'a', 'b', $2, $3) returning id`,
    [ids.clientA1, ids.ws, ids.a1]
  );
  await as(db, ids.manager);
  await db.query(
    `insert into public.transports(ref, order_id, client_id, origin, destination, workspace_id, client_company_id)
     values ('01-02-10-0007', $1, $2, 'a', 'b', $3, $4)`,
    [rows[0].id, ids.clientA1, ids.ws, ids.a1]
  );

  const find = async (user, number) => {
    await as(db, user);
    return (await db.query("select kind, ref from public.find_by_number($1)", [number])).rows;
  };

  assert.deepEqual(await find(ids.clientA1, "zk-1042 "), [{ kind: "order", ref: "ZK-1042" }]);
  assert.deepEqual(await find(ids.clientA1, "01-02-10-0007"), [{ kind: "transport", ref: "01-02-10-0007" }]);
  assert.deepEqual(await find(ids.manager, "ZK-1042"), [{ kind: "order", ref: "ZK-1042" }]);
  // other client company, other tenant and an unknown number: the same empty answer
  assert.deepEqual(await find(ids.clientA2, "ZK-1042"), []);
  assert.deepEqual(await find(ids.clientB1, "ZK-1042"), []);
  assert.deepEqual(await find(ids.clientA1, "ZK-9999"), []);
  assert.deepEqual(await find(ids.clientA1, "Z"), []);
});
