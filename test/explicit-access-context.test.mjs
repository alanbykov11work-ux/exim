import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const text = async (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("migration prevents a session from selecting another user's membership", async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(`
    create table app_users (id uuid primary key);
    create table workspace_memberships (
      id uuid primary key,
      user_id uuid not null references app_users(id),
      workspace_id uuid not null,
      role text not null,
      client_company_id uuid,
      status text not null default 'active',
      created_at timestamptz not null default now()
    );
    create table app_sessions (
      id uuid primary key,
      user_id uuid not null references app_users(id),
      token_hash text not null,
      expires_at timestamptz not null,
      created_at timestamptz not null default now(),
      last_seen_at timestamptz not null default now()
    );
  `);
  await db.exec(await text("db/migrations/0002_explicit_access_context.sql"));

  const userA = "10000000-0000-4000-8000-000000000001";
  const userB = "10000000-0000-4000-8000-000000000002";
  const membershipA = "20000000-0000-4000-8000-000000000001";
  const membershipB = "20000000-0000-4000-8000-000000000002";
  const sessionA = "30000000-0000-4000-8000-000000000001";

  await db.query("insert into app_users(id) values ($1), ($2)", [userA, userB]);
  await db.query(
    `insert into workspace_memberships(id, user_id, workspace_id, role)
     values ($1, $2, '40000000-0000-4000-8000-000000000001', 'manager'),
            ($3, $4, '40000000-0000-4000-8000-000000000002', 'tenant_admin')`,
    [membershipA, userA, membershipB, userB]
  );
  await db.query(
    "insert into app_sessions(id, user_id, token_hash, expires_at) values ($1, $2, 'token-hash', now() + interval '1 day')",
    [sessionA, userA]
  );

  await db.query("update app_sessions set active_membership_id = $2 where id = $1", [sessionA, membershipA]);
  await assert.rejects(
    db.query("update app_sessions set active_membership_id = $2 where id = $1", [sessionA, membershipB]),
    /foreign key|violates/i
  );
});

test("runtime selects only an exact active membership and never role priority", async () => {
  const session = await text("lib/auth/session.ts");
  assert.match(session, /active_membership_id/);
  assert.match(session, /m\.id = \$2::uuid/);
  assert.match(session, /m\.user_id = \$1/);
  assert.doesNotMatch(session, /order by case m\.role/i);
  assert.match(session, /access_context\.selected/);
});

test("context mutation is origin checked and module access is server enforced", async () => {
  const route = await text("app/api/access-context/route.ts");
  const authorize = await text("lib/auth/authorize.ts");
  assert.match(route, /sameOrigin\(request\)/);
  assert.match(route, /selectActorContext\(membershipId\)/);
  assert.match(authorize, /module_entitlements/);
  assert.match(authorize, /module_not_enabled/);
});

test("client and logistician workflow projections omit forbidden financial fields", async () => {
  const route = await text("app/api/workflow/snapshot/route.ts");
  const clientProjection = route.match(/actor\.role === "client"[\s\S]*?: `([\s\S]*?)`\n\s*: logistics/)?.[1] || "";
  const logisticianProjection = route.match(/: logistics[\s\S]*?\? `([\s\S]*?)`\n\s*: "\*"/)?.[1] || "";
  assert.doesNotMatch(clientProjection, /calc_comment|calc_route|logist_id/i);
  assert.doesNotMatch(logisticianProjection, /total_price|margin|client_decision/i);
  assert.match(route, /select f\.order_id, f\.workspace_id, f\.cost, f\.expenses, f\.updated_at/);
});
