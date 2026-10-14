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

test("AC-016/017: shipment and trip Gate workflow, actors, idempotency", async (t) => {
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
  for (const f of ["workflow.sql", "chats_tasks.sql", "badges.sql", "crm.sql", "foundation_wave_1.sql", "foundation_wave_1b_legacy_scope.sql", "foundation_wave_1c_work_scope.sql", "foundation_wave_3a_rate_quotes.sql", "foundation_wave_3b_offers.sql", "foundation_wave_3c_revisions.sql", "foundation_wave_3d_request_form.sql", "foundation_wave_3e_clarifications.sql", "foundation_wave_4a_agreement_shipment.sql", "foundation_wave_4b_trips_tracking.sql", "foundation_wave_4c_shipment_workflow.sql"]) {
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
    ["50000000-0000-4000-8000-000000000040", ids.a1, JSON.stringify(full)])).rows[0].order_id;
  await as(db, ids.manager);
  await db.query("update public.orders set logist_id=$1, status='assigned' where id=$2", [ids.logist, order]);
  await as(db, ids.logist);
  const rates = [];
  for (const a of [100, 110]) rates.push((await db.query("insert into public.rate_quotes(order_id, carrier, amount) values ($1,'C',$2) returning id", [order, a])).rows[0].id);
  await db.query("update public.orders set status='calculated' where id=$1", [order]);
  await assert.rejects(db.query("select public.select_rate($1,$2)", [order, rates[0]]));

  await as(db, ids.manager);
  await db.query("select public.select_rate($1,$2)", [order, rates[1]]);
  const offer = (await db.query("select * from public.send_offer($1, 500)", [order])).rows[0];
  await assert.rejects(db.query("select public.record_agreement($1,'contract',current_date)", [order]), /approved offer/);
  await assert.rejects(db.query("select * from public.create_shipment($1)", [order]), /agreement/);
  await assert.rejects(db.query("insert into public.transports(ref, order_id, client_id, origin, destination, workspace_id, client_company_id) values ('X-1',$1,$2,'a','b',$3,$4)", [order, ids.clientA1, ids.ws, ids.a1]), /create_shipment/);

  await as(db, ids.clientA1);
  await db.query("select public.decide_offer($1,'approved')", [offer.offer_id]);
  await as(db, ids.manager);
  await assert.rejects(db.query("update public.orders set status='contract_signed' where id=$1", [order]), /agreement basis/);
  await assert.rejects(db.query("select public.record_agreement($1,'contract',current_date + 1)", [order]), /future/);
  const a1 = (await db.query("select public.record_agreement($1,'contract',current_date,'Д-15') id", [order])).rows[0].id;
  const a2 = (await db.query("select public.record_agreement($1,'contract',current_date,'Д-16') id", [order])).rows[0].id;
  assert.equal(a1, a2);
  const tr = (await db.query("select * from public.create_shipment($1)", [order])).rows[0].transport_id;

  const stage = async () => { await as(db, ids.manager); return (await db.query("select stage, status, progress from public.transports where id=$1", [tr])).rows[0]; };
  const adv = (to, note) => db.query("select public.advance_shipment($1,$2,$3) s", [tr, to, note ?? null]);
  assert.equal((await stage()).stage, "preparation");

  // wrong actors
  await as(db, ids.manager);
  await assert.rejects(adv("factory_contact", "звонок"), /assigned logistician/);
  await assert.rejects(db.query("update public.transports set status='in_transit' where id=$1", [tr]), /advance_shipment/);
  await as(db, ids.clientA1);
  await assert.rejects(adv("factory_contact", "звонок"));

  await as(db, ids.logist);
  await assert.rejects(adv("pickup_waiting"), /not allowed/);
  await assert.rejects(adv("factory_contact", ""), /factory contact/);
  await adv("factory_contact", "фабрика подтвердила готовность 20.10");
  await adv("pickup_waiting");
  await assert.rejects(adv("loading"), /trip/);

  // trips: idempotent, sequence, assignee, required road data
  await assert.rejects(db.query("insert into public.trips(transport_id, name) values ($1,'x')", [tr]), /create_trip/);
  const key1 = "60000000-0000-4000-8000-000000000001", key2 = "60000000-0000-4000-8000-000000000002";
  const mk = (key, carrier = "ТОО Перевозчик", vehicle = "123ABC01") => db.query(
    "select * from public.create_trip($1,$2,'road','Урумчи → Хоргос → Алматы','Машина 1',$3,$4,'Пётр')", [tr, key, carrier, vehicle]);
  await assert.rejects(mk(key1, "", ""), /carrier and vehicle/);
  const t1 = (await mk(key1)).rows[0], t1b = (await mk(key1)).rows[0];
  assert.equal(t1.created, true); assert.equal(t1b.created, false); assert.equal(t1.trip_id, t1b.trip_id); assert.equal(t1.sequence, 1);
  const t2 = (await mk(key2)).rows[0];
  assert.equal(t2.sequence, 2);
  await assert.rejects(db.query("update public.trips set trip_stage='in_transit' where id=$1", [t1.trip_id]), /advance_trip/);
  await assert.rejects(adv("in_transit"), /not allowed/);
  await adv("loading");
  await assert.rejects(adv("in_transit"), /trip must be in transit/);
  await assert.rejects(db.query("select public.advance_trip($1,'in_transit')", [t1.trip_id]), /not allowed/);
  await db.query("select public.advance_trip($1,'loading')", [t1.trip_id]);
  await db.query("select public.advance_trip($1,'in_transit')", [t1.trip_id]);
  await assert.rejects(db.query("select public.advance_trip($1,'delivered')", [t1.trip_id]));
  await adv("in_transit");
  await assert.rejects(adv("delivered"), /not allowed/);
  assert.deepEqual(JSON.parse(JSON.stringify(await stage())), { stage: "in_transit", status: "in_transit", progress: 50 });

  await as(db, ids.manager);
  await assert.rejects(db.query("select public.advance_trip($1,'loading')", [t2.trip_id]), /assignee/);
  await db.exec("reset role");
  const audit = (await db.query("select action from public.tenant_audit_events where action like 'shipment.stage%' or action like 'trip.%'")).rows.length;
  assert.equal(audit, 4 + 2 + 2);

  await as(db, ids.clientA1);
  const ct = (await db.query("select * from public.client_trips($1)", [tr])).rows;
  assert.equal(ct.length, 2); assert.equal(ct[0].sequence, 1); assert.equal(ct[0].trip_stage, "in_transit");
  assert.ok(!("carrier" in ct[0]) && !("vehicle_no" in ct[0]) && !("driver" in ct[0]));
  assert.equal((await db.query("select count(*)::int n from public.shipment_stage_history")).rows[0].n, 4);
  await assert.rejects(db.query("select note from public.shipment_stage_history"));
  await as(db, ids.clientB1);
  assert.equal((await db.query("select count(*)::int n from public.shipment_stage_history")).rows[0].n, 0);
});
