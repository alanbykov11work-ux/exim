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
  logistA: "40000000-0000-4000-8000-000000000004",
  logistA2: "40000000-0000-4000-8000-000000000005",
  adminA: "40000000-0000-4000-8000-000000000006",
  clientB1: "40000000-0000-4000-8000-000000000007",
  adminB: "40000000-0000-4000-8000-000000000008",
  legacyOrder: "50000000-0000-4000-8000-000000000001",
};

const sqlFile = (name) => readFile(new URL(`../supabase/${name}`, import.meta.url), "utf8");

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
  `);
  await db.exec(await sqlFile("workflow.sql"));
  await db.exec(await sqlFile("foundation_wave_1.sql"));
  return db;
}

async function provisionFixture(db) {
  const users = [
    ids.clientA1, ids.clientA2, ids.managerA, ids.logistA,
    ids.logistA2, ids.adminA, ids.clientB1, ids.adminB,
  ];
  for (const id of users) {
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
       ($1, $7, 'logistician', null),
       ($1, $8, 'logistician', null),
       ($1, $9, 'tenant_admin', null),
       ($10, $11, 'client', $12),
       ($10, $13, 'tenant_admin', null)`,
    [
      ids.workspaceA, ids.clientA1, ids.companyA1, ids.clientA2, ids.companyA2,
      ids.managerA, ids.logistA, ids.logistA2, ids.adminA,
      ids.workspaceB, ids.clientB1, ids.companyB1, ids.adminB,
    ]
  );
  await db.query(
    "insert into public.module_entitlements(workspace_id, module_code, enabled) values ($1, 'private_os', true), ($2, 'private_os', true)",
    [ids.workspaceA, ids.workspaceB]
  );
}

async function assumeUser(db, userId) {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [userId]);
  await db.exec("set role authenticated");
}

async function assumeOwner(db) {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub', '', false)");
}

async function setup(t, { legacy = false } = {}) {
  const db = await createDatabase();
  t.after(() => db.close());
  await provisionFixture(db);
  if (legacy) {
    await db.query(
      `insert into public.orders(id, ref, client_id, created_by, origin, destination, total_price)
       values ($1, 'ZK-LEGACY', $2, $2, 'Urumqi', 'Almaty', 900)`,
      [ids.legacyOrder, ids.clientA1]
    );
  }
  await db.exec(await sqlFile("foundation_wave_1b_legacy_scope.sql"));
  return db;
}

async function createOrder(db, { ref = "ZK-0001" } = {}) {
  await assumeUser(db, ids.clientA1);
  const { rows } = await db.query(
    `insert into public.orders(ref, client_id, created_by, origin, destination, workspace_id, client_company_id)
     values ($1, $2, $2, 'Urumqi', 'Almaty', $3, $4) returning id`,
    [ref, ids.clientA1, ids.workspaceA, ids.companyA1]
  );
  return rows[0].id;
}

const refs = async (db) =>
  (await db.query("select ref from public.orders order by ref")).rows.map((row) => row.ref);

test("orders are isolated by workspace, client company and assignment", async (t) => {
  const db = await setup(t);
  const orderId = await createOrder(db);

  assert.deepEqual(await refs(db), ["ZK-0001"]);

  await assumeUser(db, ids.clientA2);
  assert.deepEqual(await refs(db), []);
  await assumeUser(db, ids.clientB1);
  assert.deepEqual(await refs(db), []);
  await assumeUser(db, ids.adminB);
  assert.deepEqual(await refs(db), []);
  await assumeUser(db, ids.logistA);
  assert.deepEqual(await refs(db), [], "an unassigned logistician sees nothing");

  await assumeUser(db, ids.managerA);
  assert.deepEqual(await refs(db), ["ZK-0001"]);
  await db.query("update public.orders set logist_id = $1, status = 'assigned' where id = $2", [
    ids.logistA, orderId,
  ]);

  await assumeUser(db, ids.logistA);
  assert.deepEqual(await refs(db), ["ZK-0001"]);
  await assumeUser(db, ids.logistA2);
  assert.deepEqual(await refs(db), [], "another logistician of the same workspace sees nothing");

  // direct ID from another tenant: no row, no disclosure
  await assumeUser(db, ids.clientB1);
  const direct = await db.query("select id from public.orders where id = $1", [orderId]);
  assert.equal(direct.rows.length, 0);
});

test("a client cannot create an order outside the own scope", async (t) => {
  const db = await setup(t);
  await assumeUser(db, ids.clientA1);

  await assert.rejects(
    db.query(
      `insert into public.orders(ref, client_id, created_by, origin, destination, workspace_id, client_company_id)
       values ('ZK-X1', $1, $1, 'a', 'b', $2, $3)`,
      [ids.clientA1, ids.workspaceA, ids.companyA2]
    ),
    /row-level security/
  );
  await assert.rejects(
    db.query(
      `insert into public.orders(ref, client_id, created_by, origin, destination, workspace_id, client_company_id)
       values ('ZK-X2', $1, $1, 'a', 'b', $2, $3)`,
      [ids.clientA1, ids.workspaceB, ids.companyB1]
    ),
    /row-level security/
  );
  await assert.rejects(
    db.query(
      `insert into public.orders(ref, client_id, created_by, origin, destination)
       values ('ZK-X3', $1, $1, 'a', 'b')`,
      [ids.clientA1]
    ),
    /requires workspace and client company scope/
  );
});

test("price, cost and internal comment are absent from forbidden payloads", async (t) => {
  const db = await setup(t);
  const orderId = await createOrder(db);

  await assumeUser(db, ids.managerA);
  await db.query("update public.orders set logist_id = $1, status = 'assigned' where id = $2", [
    ids.logistA, orderId,
  ]);

  await assumeUser(db, ids.logistA);
  await db.query(
    "update public.orders set calc_route = 'via Khorgos', calc_days = '12', calc_comment = 'carrier X, cash', status = 'calculated' where id = $1",
    [orderId]
  );
  await db.query(
    "insert into public.order_finance(order_id, cost, expenses) values ($1, 700, '[]')",
    [orderId]
  );
  await assert.rejects(
    db.query("update public.orders set total_price = 1 where id = $1", [orderId]),
    /logistician cannot change price/
  );

  await assumeUser(db, ids.managerA);
  await db.query(
    "update public.orders set total_price = 1000, offer_comment = 'door to door', offer_sent_at = now(), status = 'offer_sent' where id = $1",
    [orderId]
  );
  await db.query("update public.order_finance set margin = 300 where order_id = $1", [orderId]);

  // no API role can select the sensitive columns straight from the table
  for (const user of [ids.managerA, ids.logistA, ids.clientA1]) {
    await assumeUser(db, user);
    await assert.rejects(db.query("select total_price from public.orders"), /permission denied/);
    await assert.rejects(db.query("select * from public.orders"), /permission denied/);
  }

  const scoped = async (user) => {
    await assumeUser(db, user);
    return (await db.query("select * from public.orders_scoped($1)", [ids.workspaceA])).rows;
  };

  const [asManager] = await scoped(ids.managerA);
  assert.equal(Number(asManager.total_price), 1000);
  assert.equal(asManager.calc_comment, "carrier X, cash");

  const [asLogist] = await scoped(ids.logistA);
  assert.equal(asLogist.total_price, null, "logistician never receives the client price");
  assert.equal(asLogist.offer_comment, null);
  assert.equal(asLogist.calc_comment, "carrier X, cash");

  const [asClient] = await scoped(ids.clientA1);
  assert.equal(Number(asClient.total_price), 1000);
  assert.equal(asClient.calc_comment, null, "client never receives the internal comment");

  assert.deepEqual(await scoped(ids.clientA2), []);
  assert.deepEqual(await scoped(ids.clientB1), []);
  assert.deepEqual(await scoped(ids.logistA2), []);

  // cost and margin: staff of the order only
  await assumeUser(db, ids.clientA1);
  assert.equal((await db.query("select * from public.order_finance")).rows.length, 0);
  await assumeUser(db, ids.logistA2);
  assert.equal((await db.query("select * from public.order_finance")).rows.length, 0);
  await assumeUser(db, ids.logistA);
  assert.equal((await db.query("select * from public.order_finance")).rows.length, 1);

  // the client answers the offer and nothing else
  await assumeUser(db, ids.clientA1);
  await assert.rejects(
    db.query(
      "update public.orders set status = 'approved', client_decision = 'approved', origin = 'Elsewhere' where id = $1",
      [orderId]
    ),
    /client cannot change the offer or the request/
  );
  await db.query(
    "update public.orders set status = 'approved', client_decision = 'approved', client_decision_at = now() where id = $1",
    [orderId]
  );
  // a recorded decision cannot be replaced: the row is no longer updatable
  const replay = await db.query(
    "update public.orders set status = 'rejected', client_decision = 'rejected' where id = $1",
    [orderId]
  );
  assert.equal(replay.affectedRows, 0);
  const [final] = (await db.query("select status from public.orders where id = $1", [orderId])).rows;
  assert.equal(final.status, "approved");
});

test("price is hidden from the client until the offer is sent", async (t) => {
  const db = await setup(t);
  const orderId = await createOrder(db);
  await assumeUser(db, ids.managerA);
  await db.query("update public.orders set total_price = 1000 where id = $1", [orderId]);
  await assumeUser(db, ids.clientA1);
  const [row] = (await db.query("select * from public.orders_scoped($1)", [ids.workspaceA])).rows;
  assert.equal(row.total_price, null);
});

test("order scope is immutable and history is append-only", async (t) => {
  const db = await setup(t);
  const orderId = await createOrder(db);

  await assumeUser(db, ids.managerA);
  await assert.rejects(
    db.query("update public.orders set client_company_id = $1 where id = $2", [ids.companyA2, orderId]),
    /order scope is immutable/
  );
  await db.query(
    "insert into public.order_history(order_id, actor_id, action) values ($1, $2, 'note')",
    [orderId, ids.managerA]
  );
  await assert.rejects(db.query("update public.order_history set action = 'x'"), /permission denied/);
  await assert.rejects(db.query("delete from public.order_history"), /permission denied/);
  await assert.rejects(db.query("delete from public.orders"), /permission denied/);

  // a forged actor is refused
  await assert.rejects(
    db.query("insert into public.order_history(order_id, actor_id, action) values ($1, $2, 'forged')", [
      orderId, ids.clientA1,
    ]),
    /row-level security/
  );

  await assumeUser(db, ids.clientA1);
  assert.equal((await db.query("select * from public.order_history")).rows.length, 0);
});

test("transports inherit scope; trips and internal events stay staff-only", async (t) => {
  const db = await setup(t);
  const orderId = await createOrder(db);

  await assumeUser(db, ids.clientA1);
  await assert.rejects(
    db.query(
      "insert into public.transports(ref, order_id, client_id, origin, destination) values ('TR-0', $1, $2, 'a', 'b')",
      [orderId, ids.clientA1]
    ),
    /row-level security/
  );

  await assumeUser(db, ids.managerA);
  const { rows } = await db.query(
    `insert into public.transports(ref, order_id, client_id, logist_id, origin, destination, workspace_id, client_company_id)
     values ('TR-1', $1, $2, $3, 'Urumqi', 'Almaty', $4, $5) returning id, workspace_id, client_company_id`,
    [orderId, ids.clientA1, ids.logistA, ids.workspaceA, ids.companyA2]
  );
  const transportId = rows[0].id;
  assert.equal(rows[0].workspace_id, ids.workspaceA);
  assert.equal(rows[0].client_company_id, ids.companyA1, "scope follows the order, not the payload");

  await assumeUser(db, ids.logistA);
  const trip = await db.query(
    "insert into public.trips(transport_id, name, driver) values ($1, 'DAF 123ABC01', 'Driver Name +7700') returning id",
    [transportId]
  );
  await db.query(
    "insert into public.trip_events(transport_id, trip_id, internal_text, created_by) values ($1, $2, 'carrier delayed at border', $3)",
    [transportId, trip.rows[0].id, ids.logistA]
  );
  await assert.rejects(
    db.query(
      "insert into public.transport_updates(transport_id, public_text, published_by) values ($1, 'x', $2)",
      [transportId, ids.logistA]
    ),
    /row-level security/,
    "a logistician does not publish to the client"
  );

  await assumeUser(db, ids.managerA);
  await db.query(
    "insert into public.transport_updates(transport_id, public_text, published_by) values ($1, 'Cargo is at the border', $2)",
    [transportId, ids.managerA]
  );

  await assumeUser(db, ids.clientA1);
  assert.equal((await db.query("select * from public.trips")).rows.length, 0);
  assert.equal((await db.query("select * from public.trip_events")).rows.length, 0);
  const safeTrips = (await db.query("select * from public.client_trips($1)", [transportId])).rows;
  assert.equal(safeTrips.length, 1);
  assert.deepEqual(Object.keys(safeTrips[0]).sort(), ["created_at", "id", "status", "transport_id"]);
  const updates = (await db.query("select public_text from public.transport_updates")).rows;
  assert.deepEqual(updates.map((row) => row.public_text), ["Cargo is at the border"]);

  for (const outsider of [ids.clientA2, ids.clientB1, ids.adminB, ids.logistA2]) {
    await assumeUser(db, outsider);
    assert.equal((await db.query("select id from public.transports")).rows.length, 0);
    assert.equal((await db.query("select * from public.client_trips($1)", [transportId])).rows.length, 0);
    assert.equal((await db.query("select * from public.transport_updates")).rows.length, 0);
    assert.equal((await db.query("select * from public.trip_events")).rows.length, 0);
  }
});

test("a disabled Private OS entitlement blocks writes and keeps the data", async (t) => {
  const db = await setup(t);
  const orderId = await createOrder(db);

  await assumeOwner(db);
  await db.query(
    "update public.module_entitlements set enabled = false where workspace_id = $1 and module_code = 'private_os'",
    [ids.workspaceA]
  );

  await assumeUser(db, ids.clientA1);
  await assert.rejects(
    db.query(
      `insert into public.orders(ref, client_id, created_by, origin, destination, workspace_id, client_company_id)
       values ('ZK-0002', $1, $1, 'a', 'b', $2, $3)`,
      [ids.clientA1, ids.workspaceA, ids.companyA1]
    ),
    /row-level security/
  );
  assert.deepEqual(await refs(db), ["ZK-0001"], "existing data stays readable");

  await assumeUser(db, ids.managerA);
  const blocked = await db.query("update public.orders set status = 'assigned' where id = $1", [orderId]);
  assert.equal(blocked.affectedRows, 0);
});

test("legacy rows are invisible until an owner assigns their scope", async (t) => {
  const db = await setup(t, { legacy: true });

  await assumeUser(db, ids.managerA);
  assert.deepEqual(await refs(db), []);
  await assumeUser(db, ids.clientA1);
  assert.deepEqual(await refs(db), [], "even the original author cannot read an unscoped row");

  await assert.rejects(
    db.query("select public.legacy_assign_order_scope($1, $2, $3, 'self service')", [
      ids.legacyOrder, ids.workspaceA, ids.companyA1,
    ]),
    /permission denied/
  );

  await assumeOwner(db);
  await assert.rejects(
    db.query("select public.legacy_assign_order_scope($1, $2, $3, 'wrong tenant')", [
      ids.legacyOrder, ids.workspaceA, ids.companyB1,
    ]),
    /client company does not belong to the workspace/
  );
  await db.query("select public.legacy_assign_order_scope($1, $2, $3, 'backfill rehearsal')", [
    ids.legacyOrder, ids.workspaceA, ids.companyA1,
  ]);
  await assert.rejects(
    db.query("select public.legacy_assign_order_scope($1, $2, $3, 'second run')", [
      ids.legacyOrder, ids.workspaceA, ids.companyA2,
    ]),
    /order not found or already scoped/
  );
  const audit = await db.query(
    "select action, reason from public.tenant_audit_events where object_id = $1",
    [ids.legacyOrder]
  );
  assert.deepEqual(audit.rows, [
    { action: "legacy.order_scope_assigned", reason: "backfill rehearsal" },
  ]);

  await assumeUser(db, ids.managerA);
  assert.deepEqual(await refs(db), ["ZK-LEGACY"]);
  await assumeUser(db, ids.clientA1);
  assert.deepEqual(await refs(db), ["ZK-LEGACY"]);
  await assumeUser(db, ids.clientA2);
  assert.deepEqual(await refs(db), []);
  await assumeUser(db, ids.clientB1);
  assert.deepEqual(await refs(db), []);
});
