import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migrationUrl = new URL("../supabase/foundation_wave_1.sql", import.meta.url);

test("Wave 1 migration defines every tenant security primitive with RLS", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  const tables = [
    "organizations",
    "tenant_workspaces",
    "client_companies",
    "workspace_memberships",
    "organization_capabilities",
    "module_entitlements",
    "tenant_audit_events",
  ];

  for (const table of tables) {
    assert.match(sql, new RegExp(`create table if not exists public\\.${table}\\b`, "i"));
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`, "i"));
    assert.match(sql, new RegExp(`revoke all on public\\.${table} from anon, authenticated`, "i"));
  }
});

test("client-company access and module access are enforced server-side", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  assert.match(sql, /create or replace function public\.can_access_client_company/i);
  assert.match(sql, /membership\.client_company_id = p_client_company_id/i);
  assert.match(sql, /create or replace function public\.has_module_entitlement/i);
  assert.match(sql, /and entitlement\.enabled/i);
  assert.match(sql, /tenant_admin_upsert_membership/i);
  assert.match(sql, /insert into public\.tenant_audit_events/i);
  assert.match(sql, /create or replace function public\.can_read_profile/i);
  assert.match(sql, /profiles tenant scoped read/i);
  assert.match(sql, /revoke all on function public\.admin_set_role/i);
});

test("organization capabilities are multi-valued and inert", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  assert.match(sql, /primary key \(organization_id, code\)/i);
  assert.doesNotMatch(sql, /cargo_publisher|transport_publisher/i);
  assert.doesNotMatch(sql, /grant (insert|update|delete|all).*organization_capabilities.*authenticated/i);
});
