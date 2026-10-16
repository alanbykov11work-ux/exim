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
  legacyLead: "60000000-0000-4000-8000-000000000001",
};

const sqlFile = (name) => readFile(new URL(`../supabase/${name}`, import.meta.url), "utf8");

async function createDatabase() {
  const db = new PGlite();
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create publication supabase_realtime;
    create schema auth;
    create table auth.users (id uuid primary key);
    create or replace function auth.uid()
    returns uuid language sql stable
    as $$ select coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''), (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'))::uuid $$;

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
  for (const file of ["workflow.sql", "chats_tasks.sql", "badges.sql", "crm.sql", "foundation_wave_1.sql"]) {
    await db.exec(await sqlFile(file));
  }
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
      [id, `${id.slice(-4)}@test.invalid`, `user-${id.slice(-2)}`]
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
  for (const workspace of [ids.workspaceA, ids.workspaceB]) {
    for (const code of ["private_os", "crm", "tasks", "chats"]) {
      await db.query(
        "insert into public.module_entitlements(workspace_id, module_code, enabled) values ($1, $2, true)",
        [workspace, code]
      );
    }
  }
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
      "insert into public.leads(id, ref, name, created_by) values ($1, 'LD-LEGACY', 'Old lead', $2)",
      [ids.legacyLead, ids.managerA]
    );
  }
  await db.exec(await sqlFile("foundation_wave_1b_legacy_scope.sql"));
  await db.exec(await sqlFile("foundation_wave_1c_work_scope.sql"));
  return db;
}

const count = async (db, table) =>
  Number((await db.query(`select count(*)::int as n from public.${table}`)).rows[0].n);

test("CRM is visible to the sales staff of one workspace only", async (t) => {
  const db = await setup(t);

  await assumeUser(db, ids.managerA);
  const { rows } = await db.query(
    "insert into public.leads(ref, name, workspace_id, created_by) values ('LD-1', 'Lead', $1, $2) returning id",
    [ids.workspaceA, ids.managerA]
  );
  const leadId = rows[0].id;
  await db.query(
    "insert into public.lead_history(lead_id, actor_id, action) values ($1, $2, 'created')",
    [leadId, ids.managerA]
  );
  await assert.rejects(
    db.query(
      "insert into public.leads(ref, name, workspace_id, created_by) values ('LD-X', 'Lead', $1, $2)",
      [ids.workspaceB, ids.managerA]
    ),
    /row-level security/
  );
  await assert.rejects(
    db.query("insert into public.leads(ref, name, created_by) values ('LD-Y', 'Lead', $1)", [ids.managerA]),
    /requires workspace scope/
  );
  await assert.rejects(
    db.query("update public.leads set workspace_id = $1 where id = $2", [ids.workspaceB, leadId]),
    /scope is immutable/
  );
  await assert.rejects(db.query("delete from public.leads"), /permission denied/);
  await assert.rejects(db.query("update public.lead_history set action = 'x'"), /permission denied/);

  for (const outsider of [ids.clientA1, ids.logistA, ids.clientB1, ids.adminB]) {
    await assumeUser(db, outsider);
    assert.equal(await count(db, "leads"), 0);
    assert.equal(await count(db, "lead_history"), 0);
  }
  await assumeUser(db, ids.adminA);
  assert.equal(await count(db, "leads"), 1);
});

test("tasks are internal: clients are excluded and assignment stays in the workspace", async (t) => {
  const db = await setup(t);

  await assumeUser(db, ids.clientA1);
  await assert.rejects(
    db.query(
      "insert into public.tasks(title, creator_id, assignee_id, workspace_id) values ('t', $1, $2, $3)",
      [ids.clientA1, ids.managerA, ids.workspaceA]
    ),
    /row-level security/
  );

  await assumeUser(db, ids.logistA);
  await assert.rejects(
    db.query(
      "insert into public.tasks(title, creator_id, assignee_id, workspace_id) values ('t', $1, $2, $3)",
      [ids.logistA, ids.adminB, ids.workspaceA]
    ),
    /assignee must be an active staff member/
  );
  await assert.rejects(
    db.query(
      "insert into public.tasks(title, creator_id, assignee_id, workspace_id) values ('t', $1, $2, $3)",
      [ids.logistA, ids.clientA1, ids.workspaceA]
    ),
    /assignee must be an active staff member/
  );
  const { rows } = await db.query(
    "insert into public.tasks(title, creator_id, assignee_id, workspace_id) values ('Check docs', $1, $2, $3) returning id",
    [ids.logistA, ids.logistA2, ids.workspaceA]
  );
  const taskId = rows[0].id;

  await assumeUser(db, ids.logistA2);
  assert.equal(await count(db, "tasks"), 1);
  await db.query("update public.tasks set status = 'in_progress' where id = $1", [taskId]);
  await db.query("insert into public.task_comments(task_id, author_id, text) values ($1, $2, 'on it')", [
    taskId, ids.logistA2,
  ]);
  await assert.rejects(
    db.query("update public.tasks set assignee_id = $1 where id = $2", [ids.managerA, taskId]),
    /only the author or a manager can reassign/
  );
  await assert.rejects(
    db.query("update public.tasks set creator_id = $1 where id = $2", [ids.logistA2, taskId]),
    /task author is immutable/
  );
  await assert.rejects(db.query("delete from public.task_comments"), /permission denied/);

  await assumeUser(db, ids.managerA);
  assert.equal(await count(db, "tasks"), 1, "a manager oversees the workspace");
  await db.query("update public.tasks set assignee_id = $1 where id = $2", [ids.logistA, taskId]);

  for (const outsider of [ids.clientA1, ids.clientB1, ids.adminB]) {
    await assumeUser(db, outsider);
    assert.equal(await count(db, "tasks"), 0);
    assert.equal(await count(db, "task_comments"), 0);
  }
});

test("chats are created through one command and never cross a boundary", async (t) => {
  const db = await setup(t);

  await assumeUser(db, ids.clientA1);
  await assert.rejects(
    db.query("insert into public.chats(name, created_by, workspace_id) values ('x', $1, $2)", [
      ids.clientA1, ids.workspaceA,
    ]),
    /permission denied/
  );
  await assert.rejects(
    db.query("select public.create_chat($1, 'x', false, $2)", [ids.workspaceA, [ids.clientA2]]),
    /a client can only start a chat with staff/
  );
  await assert.rejects(
    db.query("select public.create_chat($1, 'x', false, $2)", [ids.workspaceA, [ids.adminB]]),
    /every member must belong to the workspace/
  );
  await assert.rejects(
    db.query("select public.create_chat($1, 'x', false, $2)", [ids.workspaceB, [ids.adminB]]),
    /workspace membership required/
  );

  const created = await db.query("select public.create_chat($1, 'Manager', false, $2) as id", [
    ids.workspaceA, [ids.managerA],
  ]);
  const chatId = created.rows[0].id;
  await db.query("insert into public.chat_messages(chat_id, sender_id, text) values ($1, $2, 'hello')", [
    chatId, ids.clientA1,
  ]);
  await assert.rejects(
    db.query("insert into public.chat_messages(chat_id, sender_id, text) values ($1, $2, 'forged')", [
      chatId, ids.managerA,
    ]),
    /row-level security/
  );
  // the old hole: joining someone else's chat by id
  await assumeUser(db, ids.clientA2);
  await assert.rejects(
    db.query("insert into public.chat_members(chat_id, user_id) values ($1, $2)", [chatId, ids.clientA2]),
    /permission denied/
  );
  assert.equal(await count(db, "chats"), 0);
  assert.equal(await count(db, "chat_messages"), 0);

  await assumeUser(db, ids.managerA);
  assert.equal(await count(db, "chat_messages"), 1);
  assert.equal((await db.query("select public.unread_messages() as n")).rows[0].n, 1);
  await db.query("update public.chat_members set last_read_at = now() + interval '1 second' where chat_id = $1 and user_id = $2", [
    chatId, ids.managerA,
  ]);
  assert.equal((await db.query("select public.unread_messages() as n")).rows[0].n, 0);
  await assert.rejects(
    db.query("update public.chat_members set user_id = $1 where chat_id = $2", [ids.adminA, chatId]),
    /permission denied/
  );
  await assert.rejects(
    db.query("select public.create_chat($1, 'mixed', true, $2)", [ids.workspaceA, [ids.clientA1, ids.clientA2]]),
    /cannot mix clients of different client companies/
  );
  await assert.rejects(db.query("delete from public.chat_messages"), /permission denied/);

  for (const outsider of [ids.clientB1, ids.adminB, ids.logistA]) {
    await assumeUser(db, outsider);
    assert.equal(await count(db, "chats"), 0);
    assert.equal(await count(db, "chat_members"), 0);
    assert.equal(await count(db, "chat_messages"), 0);
  }

  // suspending the membership closes the chat for that person at once
  await assumeOwner(db);
  await db.query("update public.workspace_memberships set status = 'suspended' where user_id = $1", [ids.clientA1]);
  await assumeUser(db, ids.clientA1);
  assert.equal(await count(db, "chat_messages"), 0);
});

test("the directory never shows one client to another", async (t) => {
  const db = await setup(t);
  const directory = async (user, workspace = ids.workspaceA) => {
    await assumeUser(db, user);
    return (await db.query("select * from public.workspace_directory($1)", [workspace])).rows;
  };

  const asClient = await directory(ids.clientA1);
  assert.deepEqual(
    asClient.map((row) => row.id).sort(),
    [ids.clientA1, ids.managerA, ids.logistA, ids.logistA2, ids.adminA].sort()
  );
  for (const row of asClient) {
    assert.equal(row.email === null, row.id !== ids.clientA1, "a client sees only the own email");
  }

  const asManager = await directory(ids.managerA);
  assert.equal(asManager.length, 6);
  assert.ok(asManager.every((row) => row.email));

  assert.deepEqual(await directory(ids.clientB1), []);
  assert.deepEqual(await directory(ids.clientA1, ids.workspaceB), []);
});

test("the client decision command obeys the row policy and the guard", async (t) => {
  const db = await setup(t);
  await assumeUser(db, ids.clientA1);
  const { rows } = await db.query(
    `insert into public.orders(ref, client_id, created_by, origin, destination, workspace_id, client_company_id)
     values ('ZK-1', $1, $1, 'a', 'b', $2, $3) returning id`,
    [ids.clientA1, ids.workspaceA, ids.companyA1]
  );
  const orderId = rows[0].id;

  await assert.rejects(
    db.query("select public.decide_order($1, 'approved')", [orderId]),
    /offer is not awaiting a decision/
  );
  await assumeUser(db, ids.managerA);
  await db.query(
    "update public.orders set total_price = 10, offer_sent_at = now(), status = 'offer_sent' where id = $1",
    [orderId]
  );
  await assumeUser(db, ids.clientA2);
  await assert.rejects(
    db.query("select public.decide_order($1, 'approved')", [orderId]),
    /offer is not awaiting a decision/,
    "another client company gets the same answer as for a missing order"
  );
  await assumeUser(db, ids.clientA1);
  await assert.rejects(db.query("select public.decide_order($1, 'paid')", [orderId]), /must be approved or rejected/);
  await db.query("select public.decide_order($1, 'approved')", [orderId]);
  await assert.rejects(
    db.query("select public.decide_order($1, 'rejected')", [orderId]),
    /offer is not awaiting a decision/
  );
});

test("legacy leads stay hidden until an owner assigns the workspace", async (t) => {
  const db = await setup(t, { legacy: true });

  await assumeUser(db, ids.managerA);
  assert.equal(await count(db, "leads"), 0);
  await assert.rejects(
    db.query("select public.legacy_assign_work_scope('lead', $1, $2, 'self service')", [
      ids.legacyLead, ids.workspaceA,
    ]),
    /permission denied/
  );

  await assumeOwner(db);
  await assert.rejects(
    db.query("select public.legacy_assign_work_scope('order', $1, $2, 'wrong type')", [
      ids.legacyLead, ids.workspaceA,
    ]),
    /object type must be lead, task or chat/
  );
  await db.query("select public.legacy_assign_work_scope('lead', $1, $2, 'backfill rehearsal')", [
    ids.legacyLead, ids.workspaceA,
  ]);
  await assert.rejects(
    db.query("select public.legacy_assign_work_scope('lead', $1, $2, 'again')", [ids.legacyLead, ids.workspaceB]),
    /not found or already scoped/
  );

  await assumeUser(db, ids.managerA);
  assert.equal(await count(db, "leads"), 1);
  await assumeUser(db, ids.adminB);
  assert.equal(await count(db, "leads"), 0);
});
