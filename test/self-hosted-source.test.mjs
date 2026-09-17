import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const text = async (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("runtime dependencies no longer include Supabase", async () => {
  const manifest = JSON.parse(await text("package.json"));
  const dependencies = { ...manifest.dependencies, ...manifest.devDependencies };
  assert.equal(dependencies["@supabase/ssr"], undefined);
  assert.equal(dependencies["@supabase/supabase-js"], undefined);
  assert.ok(dependencies.pg);
});

test("ordinary PostgreSQL schema has tenant scope and no Supabase auth dependency", async () => {
  const migration = await text("db/migrations/0001_self_hosted_core.sql");
  const statements = migration.replace(/^\s*--.*$/gm, "");
  for (const table of [
    "app_users",
    "app_sessions",
    "tenant_workspaces",
    "workspace_memberships",
    "orders",
    "transports",
    "documents",
  ]) {
    assert.match(migration, new RegExp(`create table public\\.${table}\\b`, "i"));
  }
  assert.doesNotMatch(statements, /auth\.users|auth\.uid\s*\(/i);
  assert.match(migration, /create table public\.orders[\s\S]*?workspace_id/i);
  assert.match(migration, /create table public\.orders[\s\S]*?client_company_id/i);
});

test("server compose keeps database private and separates edge networking", async () => {
  const compose = await text("docker-compose.server.yml");
  const dbBlock = compose.match(/\n  db:\n([\s\S]*?)\n  migrate:/)?.[1] || "";
  const webBlock = compose.match(/\n  web:\n([\s\S]*?)\n  db-backup:/)?.[1] || "";
  assert.doesNotMatch(dbBlock, /\n\s+ports:/);
  assert.match(dbBlock, /- backend/);
  assert.doesNotMatch(dbBlock, /- caddy/);
  assert.match(webBlock, /networks:\n\s+backend:/);
  assert.match(webBlock, /caddy:\n\s+aliases:\n\s+- exim-superapp/);
  assert.match(compose, /backend:\n\s+internal: true/);
});

test("registration derives identity and tenant scope on the server", async () => {
  const route = await text("app/auth/password-register/route.ts");
  assert.match(route, /insert into app_users/i);
  assert.match(route, /insert into organizations/i);
  assert.match(route, /insert into tenant_workspaces/i);
  assert.match(route, /insert into client_companies/i);
  assert.match(route, /insert into workspace_memberships/i);
  assert.match(route, /transaction\s*\(/);
});

test("user state is scoped by workspace as well as user", async () => {
  const route = await text("app/api/state/route.ts");
  assert.match(route, /where workspace_id = \$1 and user_id = \$2/i);
  assert.match(route, /insert into user_state \(workspace_id, user_id, key, value\)/i);
  assert.match(route, /on conflict \(workspace_id, user_id, key\)/i);
});
