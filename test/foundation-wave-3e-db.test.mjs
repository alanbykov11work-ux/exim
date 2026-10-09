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

test("clarifications both ways and price change reasons", async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create publication supabase_realtime;
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
  for (const f of ["workflow.sql", "chats_tasks.sql", "badges.sql", "crm.sql", "foundation_wave_1.sql", "foundation_wave_1b_legacy_scope.sql", "foundation_wave_1c_work_scope.sql", "foundation_wave_3a_rate_quotes.sql", "foundation_wave_3b_offers.sql", "foundation_wave_3c_revisions.sql", "foundation_wave_3d_request_form.sql", "foundation_wave_3e_clarifications.sql"]) {
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

  const full = { contact_name: "Иван", origin: "Урумчи", destination: "Алматы", cargo: "текстиль", weight_kg: "1000", volume_m3: "10" };
  await as(db, ids.clientA1);
  const order = (await db.query("select * from public.save_request($1,$2,$3::jsonb,true)",
    ["50000000-0000-4000-8000-000000000009", ids.a1, JSON.stringify(full)])).rows[0].order_id;
  const status = async () => { await as(db, ids.manager); return (await db.query("select status from public.orders where id=$1", [order])).rows[0].status; };

  await assert.rejects(db.query("select public.return_for_clarification($1,'уточните вес')", [order]));
  await as(db, ids.manager);
  await db.query("select public.return_for_clarification($1,'уточните вес')", [order]);
  assert.equal(await status(), "clarification");
  await as(db, ids.clientA2);
  await assert.rejects(db.query("select public.answer_clarification($1,'ок')", [order]));
  await as(db, ids.clientA1);
  await db.query("select public.revise_order($1, '{\"weight_kg\":\"1500\"}', 'вес уточнён')", [order]);
  assert.equal(await status(), "new");

  await db.query("update public.orders set logist_id=$1, status='assigned' where id=$2", [ids.logist, order]);
  await as(db, ids.logist);
  for (const a of [100, 110]) await db.query("insert into public.rate_quotes(order_id, carrier, amount) values ($1,'C',$2)", [order, a]);
  await db.query("update public.orders set status='calculated' where id=$1", [order]);
  await as(db, ids.manager);
  const v1 = (await db.query("select * from public.send_offer($1, 500)", [order])).rows[0];

  await as(db, ids.clientA1);
  await db.query("select public.request_offer_clarification($1,'что входит в цену?')", [v1.offer_id]);
  await assert.rejects(db.query("select public.decide_offer($1,'approved')", [v1.offer_id]), /no longer open/);
  assert.equal(await status(), "calculated");
  await assert.rejects(db.query("select * from public.send_offer($1, 450)", [order]), /requires a reason/);
  await db.query("select * from public.send_offer($1, 500, 'KZT', 'включено СВХ')", [order]);
  await db.query("select * from public.send_offer($1, 450, 'KZT', null, null, 'скидка за объём')", [order]);
  const hist = (await db.query("select version, total_price::int p, previous_price::int pp, price_reason r, status from public.offer_price_history($1)", [order])).rows;
  assert.equal(JSON.stringify(hist.map(h => [h.version, h.p, h.pp, h.r, h.status])),
    JSON.stringify([[1, 500, null, null, "clarification"], [2, 500, 500, null, "superseded"], [3, 450, 500, "скидка за объём", "sent"]]));

  await as(db, ids.clientA1);
  assert.equal((await db.query("select count(*)::int n from public.offer_price_history($1)", [order])).rows[0].n, 0);
  await assert.rejects(db.query("select price_reason from public.commercial_offers"));
  const msgs = (await db.query("select direction from public.order_clarifications order by id")).rows.map(r => r.direction);
  assert.equal(JSON.stringify(msgs), JSON.stringify(["to_client", "to_manager"]));
  await as(db, ids.clientB1);
  assert.equal((await db.query("select count(*)::int n from public.order_clarifications")).rows[0].n, 0);
});
