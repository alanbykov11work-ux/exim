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
  logist: "40000000-0000-4000-8000-000000000005",
};
const sqlFile = (name) => readFile(new URL(`../supabase/${name}`, import.meta.url), "utf8");

async function as(db, user) {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [user]);
  await db.exec("set role authenticated");
}

test("rate quotes: staff only, withdraw only, two rates before calculated", async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create schema auth;
    create table auth.users (id uuid primary key);
    create or replace function auth.uid() returns uuid language sql stable
      as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create table public.profiles (id uuid primary key references auth.users(id), email text,
      full_name text, company text, phone text, bin text, role text not null default 'client',
      verified boolean not null default false);
    alter table public.profiles enable row level security;
    create or replace function public.touch_updated_at() returns trigger language plpgsql
      as $$ begin new.updated_at = now(); return new; end $$;
    create or replace function public.admin_set_role(p_user uuid, p_role text)
      returns void language sql as $$ select 1 $$;
  `);
  for (const f of ["workflow.sql", "foundation_wave_1.sql", "foundation_wave_1b_legacy_scope.sql", "foundation_wave_3a_rate_quotes.sql"]) {
    await db.exec(await sqlFile(f));
  }
  for (const id of [ids.clientA1, ids.clientA2, ids.manager, ids.clientB1, ids.logist]) {
    await db.query("insert into auth.users values ($1)", [id]);
    await db.query("insert into public.profiles(id) values ($1)", [id]);
  }
  await db.query("insert into public.organizations(id, name, slug) values ($1,'A','org-a'),($2,'B','org-b')", [ids.org, ids.orgB]);
  await db.query("insert into public.tenant_workspaces(id, organization_id, name, slug) values ($1,$2,'A','ws-a'),($3,$4,'B','ws-b')", [ids.ws, ids.org, ids.wsB, ids.orgB]);
  await db.query("insert into public.client_companies(id, workspace_id, name) values ($1,$2,'A1'),($3,$2,'A2'),($4,$5,'B1')", [ids.a1, ids.ws, ids.a2, ids.b1, ids.wsB]);
  await db.query(
    `insert into public.workspace_memberships(workspace_id, user_id, role, client_company_id) values
     ($1,$2,'client',$3),($1,$4,'client',$5),($1,$6,'manager',null),($1,$10,'logistician',null),($7,$8,'client',$9)`,
    [ids.ws, ids.clientA1, ids.a1, ids.clientA2, ids.a2, ids.manager, ids.wsB, ids.clientB1, ids.b1, ids.logist]
  );
  await db.query("insert into public.module_entitlements values ($1,'private_os',true),($2,'private_os',true)", [ids.ws, ids.wsB]);

  await as(db, ids.clientA1);
  const { rows } = await db.query(
    `insert into public.orders(ref, client_id, created_by, origin, destination, workspace_id, client_company_id)
     values ('ZK-2001', $1, $1, 'a', 'b', $2, $3) returning id`, [ids.clientA1, ids.ws, ids.a1]);
  const order = rows[0].id;
  await as(db, ids.manager);
  await db.query("update public.orders set logist_id=$1, status='assigned' where id=$2", [ids.logist, order]);

  const add = (amount) => db.query("insert into public.rate_quotes(order_id, carrier, amount) values ($1,'C',$2) returning id", [order, amount]);
  await as(db, ids.clientA1);
  await assert.rejects(add(100));
  await as(db, ids.logist);
  const r1 = (await add(100)).rows[0].id;
  await assert.rejects(db.query("update public.orders set status='calculated' where id=$1", [order]), /two active rates/);
  await add(120);
  await assert.rejects(db.query("update public.rate_quotes set amount=1 where id=$1", [r1]));
  await db.query("update public.rate_quotes set status='withdrawn' where id=$1", [r1]);
  await assert.rejects(db.query("update public.orders set status='calculated' where id=$1", [order]), /two active rates/);
  await add(130);
  await db.query("update public.orders set status='calculated' where id=$1", [order]);
  await assert.rejects(db.query("delete from public.rate_quotes where id=$1", [r1]));

  await as(db, ids.clientA1);
  assert.equal((await db.query("select count(*)::int n from public.rate_quotes")).rows[0].n, 0);
  await as(db, ids.clientB1);
  assert.equal((await db.query("select count(*)::int n from public.rate_quotes")).rows[0].n, 0);
  await as(db, ids.manager);
  assert.equal((await db.query("select count(*)::int n from public.rate_quotes where status='active'")).rows[0].n, 2);
});
