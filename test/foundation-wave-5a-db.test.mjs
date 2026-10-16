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

test("REQ-003 Gate workflow: pinned versions, only Gate transitions, actors, history, client labels", async (t) => {
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
  for (const f of ["workflow.sql", "chats_tasks.sql", "badges.sql", "crm.sql", "foundation_wave_1.sql", "foundation_wave_1b_legacy_scope.sql", "foundation_wave_1c_work_scope.sql", "foundation_wave_3a_rate_quotes.sql", "foundation_wave_3b_offers.sql", "foundation_wave_3c_revisions.sql", "foundation_wave_3d_request_form.sql", "foundation_wave_3e_clarifications.sql", "foundation_wave_4a_agreement_shipment.sql", "foundation_wave_4b_trips_tracking.sql", "foundation_wave_4c_shipment_workflow.sql", "foundation_wave_5a_workflow.sql"]) {
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

  const q = (sql, p) => db.query(sql, p);
  const stage = async (type, id) => { await db.exec("reset role"); const r = (await q("select current_stage s, version_id from public.workflow_instances where object_type=$1 and object_id=$2", [type, id])).rows[0]; return r && r.s; };
  const full = { contact_name: "Иван", origin: "Урумчи", destination: "Алматы", cargo: "текстиль", weight_kg: "1000", volume_m3: "10" };

  // templates are read-only for members
  await as(db, ids.manager);
  assert.equal((await q("select count(*)::int n from public.workflow_templates")).rows[0].n, 3);
  await assert.rejects(q("update public.workflow_template_versions set status='retired'"));
  await assert.rejects(q("insert into public.workflow_templates(code, object_type, name) values ('x','trip','x')"));

  await as(db, ids.clientA1);
  const order = (await q("select * from public.save_request($1,$2,$3::jsonb,true)", ["70000000-0000-4000-8000-000000000001", ids.a1, JSON.stringify(full)])).rows[0].order_id;
  assert.equal(await stage("quote_request", order), "manager_review");

  // manager_review -> data_required -> manager_review
  await as(db, ids.clientA1);
  await assert.rejects(q("select public.assign_logist($1,$2)", [order, ids.logist]), /not allowed|role/);
  await as(db, ids.manager);
  await assert.rejects(q("update public.orders set status='assigned' where id=$1", [order]), /workflow/);
  await assert.rejects(q("select public.return_for_clarification($1,'')", [order]), /comment/);
  await q("select public.return_for_clarification($1,'уточните объём')", [order]);
  await as(db, ids.clientA1);
  await q("select public.revise_order($1,'{\"volume_m3\":\"12\"}','объём уточнён')", [order]);
  assert.equal(await stage("quote_request", order), "manager_review");

  await as(db, ids.manager);
  await q("select public.assign_logist($1,$2)", [order, ids.logist]);
  await as(db, ids.logist);
  await assert.rejects(q("insert into public.rate_quotes(order_id, carrier, amount) values ($1,'C',100)", [order]), /rate_search/);
  await q("select public.logist_accept($1)", [order]);
  await as(db, ids.clientA1);
  await assert.rejects(q("select public.revise_order($1,'{\"cargo\":\"x\"}')", [order]), /stage/);

  await as(db, ids.logist);
  const rate = (vals) => q(`insert into public.rate_quotes(order_id, carrier, amount, currency, valid_until, transit_days, availability, route, transport_mode, source, comment)
      values ($1,'C',$2,'USD',current_date + 10,9,'есть машина','Урумчи → Алматы','road','звонок перевозчику',$3) returning id`, [order, vals.amount, vals.comment]);
  const r1 = (await rate({ amount: 2000, comment: "вариант 1" })).rows[0].id;
  assert.equal(await stage("quote_request", order), "rate_search", "first rate does not change the stage");
  await as(db, ids.logist);
  await q("insert into public.rate_quotes(order_id, carrier, amount) values ($1,'C2',2100)", [order]); // incomplete, not valid
  await assert.rejects(q("select public.complete_rate_search($1)", [order]), /two valid/);
  const r2 = (await rate({ amount: 2200, comment: "вариант 2" })).rows[0].id;
  await as(db, ids.manager);
  await assert.rejects(q("select public.complete_rate_search($1)", [order]), /assigned logistician/);
  await as(db, ids.logist);
  await q("select public.complete_rate_search($1)", [order]);
  assert.equal(await stage("quote_request", order), "rate_received");

  await as(db, ids.logist);
  await assert.rejects(q("select * from public.send_offer($1, 3000)", [order]), /not allowed/);
  await as(db, ids.manager);
  await assert.rejects(q("select * from public.send_offer($1, 3000)", [order]), /select a rate/);
  await q("select public.select_rate($1,$2)", [order, r2]);
  assert.equal(await stage("quote_request", order), "offer_preparation");
  const v1 = (await q("select * from public.send_offer($1, 3000)", [order])).rows[0];
  await as(db, ids.clientA1);
  await q("select public.request_offer_clarification($1,'что входит?')", [v1.offer_id]);
  assert.equal(await stage("quote_request", order), "clarification_requested");
  await as(db, ids.manager);
  await assert.rejects(q("select * from public.send_offer($1, 2900)", [order]), /reason/);
  const v2 = (await q("select * from public.send_offer($1, 2900, 'KZT', 'включено СВХ', null, 'скидка')", [order])).rows[0];
  await as(db, ids.clientA1);
  await assert.rejects(q("select public.decide_offer($1,'rejected')", [v2.offer_id]), /comment/);
  await assert.rejects(q("select public.decide_offer($1,'approved')", [v1.offer_id]), /no longer open/);
  await q("select public.decide_offer($1,'approved')", [v2.offer_id]);

  await as(db, ids.manager);
  await assert.rejects(q("select * from public.create_shipment($1)", [order]), /agreement/);
  await assert.rejects(q("select public.record_agreement($1,'contract',current_date,'')", [order]), /document/);
  await q("select public.record_agreement($1,'contract',current_date,'Д-15')", [order]);
  assert.equal(await stage("quote_request", order), "contract_signed");
  await as(db, ids.manager);
  const s1 = (await q("select * from public.create_shipment($1)", [order])).rows[0];
  const s2 = (await q("select * from public.create_shipment($1)", [order])).rows[0];
  assert.equal(s1.transport_id, s2.transport_id);
  assert.equal(await stage("quote_request", order), "closed");
  const tr = s1.transport_id;
  assert.equal(await stage("shipment", tr), "preparation");

  // Shipment v1
  const adv = (to, note, at, loc) => q("select public.advance_shipment($1,$2,$3,$4,$5)", [tr, to, note ?? null, at ?? null, loc ?? null]);
  await as(db, ids.manager);
  await assert.rejects(adv("factory_contact", "звонок"), /assigned logistician/);
  await as(db, ids.logist);
  await assert.rejects(adv("factory_contact", ""), /comment/);
  await adv("factory_contact", "фабрика готова 20.10");
  await adv("pickup_waiting", "забор 21.10, склад Урумчи");
  await assert.rejects(adv("loading", "start"), /date\/time/);
  // Trip v1
  const key = "71000000-0000-4000-8000-000000000001";
  const trip = (await q("select * from public.create_trip($1,$2,'road')", [tr, key])).rows[0];
  assert.equal((await q("select * from public.create_trip($1,$2,'road')", [tr, key])).rows[0].trip_id, trip.trip_id);
  assert.equal(await stage("trip", trip.trip_id), "preparation");
  await as(db, ids.logist);
  await assert.rejects(q("select public.advance_trip($1,'loading', now(), 'Урумчи', 'водитель')", [trip.trip_id]), /not allowed/);
  await assert.rejects(q("select public.assign_trip_transport($1,'ТОО Перевозчик','123ABC01',null)", [trip.trip_id]), /reference/);
  await q("select public.assign_trip_transport($1,'ТОО Перевозчик','123ABC01','Пётр')", [trip.trip_id]);
  await adv("loading", "погрузка началась", "2026-10-21T08:00:00Z", "Урумчи");
  await assert.rejects(q("select public.advance_trip($1,'loading', now(), 'Урумчи', '')", [trip.trip_id]), /source/);
  await q("select public.advance_trip($1,'loading', '2026-10-21T08:00:00Z', 'Урумчи', 'водитель')", [trip.trip_id]);
  await q("select public.advance_trip($1,'in_transit', '2026-10-21T14:00:00Z', 'Урумчи', 'водитель')", [trip.trip_id]);
  await assert.rejects(q("select public.advance_trip($1,'customs_if_applicable', now(), 'Хоргос', 'водитель')", [trip.trip_id]), /not allowed/);
  await adv("in_transit", "отправлен", "2026-10-21T14:10:00Z", "Урумчи");
  await assert.rejects(adv("border_or_customs", "граница", "2026-10-22T10:00:00Z", "Хоргос"), /not allowed/);
  assert.equal(await stage("shipment", tr), "in_transit");

  // history with actor membership; legacy status follows the stage
  await db.exec("reset role");
  const h = (await q(`select i.object_type, h.from_stage, h.to_stage, h.membership_id is not null m from public.workflow_history h
                       join public.workflow_instances i on i.id = h.instance_id order by h.id`)).rows;
  const qr = h.filter(x => x.object_type === "quote_request").map(x => x.to_stage);
  assert.deepEqual(qr, ["draft", "manager_review", "data_required", "manager_review", "sent_to_logistician", "rate_search", "rate_received",
    "offer_preparation", "offer_to_client", "clarification_requested", "offer_to_client", "approved", "contract_pending", "contract_signed",
    "converted_to_shipment", "closed"]);
  assert.ok(h.filter(x => x.from_stage).every(x => x.m), "every transition records the membership");
  assert.equal((await q("select status from public.orders where id=$1", [order])).rows[0].status, "converted");
  assert.equal((await q("select status from public.transports where id=$1", [tr])).rows[0].status, "in_transit");
  await assert.rejects(q("delete from public.workflow_history"), /append-only/);

  // client: only the client label, no internal code, no history
  await as(db, ids.clientA1);
  const cs = (await q("select * from public.workflow_stages('shipment', array[$1]::uuid[])", [tr])).rows[0];
  assert.equal(cs.stage, null); assert.equal(cs.client_label, "Груз в пути"); assert.equal(cs.version, null);
  assert.equal((await q("select count(*)::int n from public.workflow_history")).rows[0].n, 0);
  await as(db, ids.clientB1);
  assert.equal((await q("select count(*)::int n from public.workflow_stages('quote_request', array[$1]::uuid[])", [order])).rows[0].n, 0);
  await as(db, ids.manager);
  const ms = (await q("select * from public.workflow_stages('quote_request', array[$1]::uuid[])", [order])).rows[0];
  assert.equal(ms.stage, "closed"); assert.equal(ms.version, 1);

  // a new template version applies only to new objects (owner action, outside the API)
  await db.exec("reset role");
  await q("select set_config('request.jwt.claim.sub', '', false)");
  await q("update public.workflow_template_versions set status='retired' where template_id=(select id from public.workflow_templates where code='quote_request_v1')");
  await q(`insert into public.workflow_template_versions(template_id, version, definition)
           select template_id, 2, definition from public.workflow_template_versions where version=1 and template_id=(select id from public.workflow_templates where code='quote_request_v1')`);
  await as(db, ids.clientA1);
  const order2 = (await q("select * from public.save_request($1,$2,$3::jsonb,false)", ["70000000-0000-4000-8000-000000000002", ids.a1, JSON.stringify(full)])).rows[0].order_id;
  await db.exec("reset role");
  const ver = async (id) => (await q("select v.version from public.workflow_instances i join public.workflow_template_versions v on v.id=i.version_id where i.object_id=$1", [id])).rows[0].version;
  assert.equal(await ver(order), 1, "old object stays on v1");
  assert.equal(await ver(order2), 2, "new object gets the active v2");

  // disabled entitlement blocks a transition and keeps the data
  await q("update public.module_entitlements set enabled=false where workspace_id=$1", [ids.ws]);
  await as(db, ids.clientA1);
  await assert.rejects(q("select * from public.save_request($1,$2,'{}'::jsonb,true)", ["70000000-0000-4000-8000-000000000002", ids.a1]), /disabled|not allowed|permission/);
  await db.exec("reset role");
  assert.equal(await stage("quote_request", order2), "draft");
  assert.equal((await q("select count(*)::int n from public.orders")).rows[0].n, 2);
});
