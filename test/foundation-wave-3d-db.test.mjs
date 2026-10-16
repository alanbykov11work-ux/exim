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

test("REQ-001 request: draft, required fields, idempotent submit, scope", async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create publication supabase_realtime;
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
  for (const f of ["workflow.sql", "chats_tasks.sql", "badges.sql", "crm.sql", "foundation_wave_1.sql", "foundation_wave_1b_legacy_scope.sql", "foundation_wave_1c_work_scope.sql", "foundation_wave_3a_rate_quotes.sql", "foundation_wave_3b_offers.sql", "foundation_wave_3c_revisions.sql", "foundation_wave_3d_request_form.sql"]) {
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

  const key = "50000000-0000-4000-8000-000000000001";
  const save = (data, submit, company = ids.a1, k = key) =>
    db.query("select * from public.save_request($1, $2, $3::jsonb, $4)", [k, company, JSON.stringify(data), submit]);

  await as(db, ids.clientA1);
  await assert.rejects(save({ origin: "x" }, false, ids.a2), /not allowed/);
  await assert.rejects(save({ origin: "x" }, false, ids.b1), /not allowed/);
  await assert.rejects(save({ status: "approved" }, false), /unknown/);
  const d1 = (await save({ origin: "Урумчи", cargo: "текстиль" }, false)).rows[0];
  assert.equal(d1.status, "draft");
  assert.ok(d1.missing.includes("weight_kg") && d1.missing.includes("destination"));
  await assert.rejects(save({}, true), /missing required fields/);
  // nothing lost after the validation error
  const d2 = (await save({ destination: "Алматы", contact_name: "Иван", weight_kg: "1200", volume_m3: "14.5", incoterms: "fca", stackable: true }, false)).rows[0];
  assert.equal(d2.order_id, d1.order_id);
  assert.equal(d2.missing.length, 0);
  const s1 = (await save({}, true)).rows[0];
  const s2 = (await save({ cargo: "подмена" }, true)).rows[0];
  assert.equal(s1.order_id, d1.order_id); assert.equal(s2.status, "new");
  assert.equal((await db.query("select count(id)::int n from public.orders")).rows[0].n, 1);
  const o = (await db.query("select cargo, incoterms, weight_kg::text w from public.orders")).rows[0];
  assert.equal(o.cargo, "текстиль"); assert.equal(o.incoterms, "FCA"); assert.equal(o.w, "1200.000");
  const r1 = (await db.query("select data->>'destination' d from public.order_revisions where revision = 1")).rows[0];
  assert.equal(r1.d, "Алматы");
  await assert.rejects(db.query("select public.revise_order($1, '{\"weight_kg\":\"\"}')", [d1.order_id]), /cannot be cleared/);

  // a manager cannot push someone's draft forward directly
  await as(db, ids.clientA1);
  const dr = (await save({ origin: "a" }, false, ids.a1, "50000000-0000-4000-8000-000000000002")).rows[0];
  await as(db, ids.manager);
  await assert.rejects(db.query("update public.orders set status='assigned' where id=$1", [dr.order_id]), /save_request/);
  await as(db, ids.clientB1);
  assert.equal((await db.query("select count(id)::int n from public.orders")).rows[0].n, 0);
});
