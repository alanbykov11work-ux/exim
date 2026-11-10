import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migrationUrl = new URL("../supabase/foundation_wave_1b_legacy_scope.sql", import.meta.url);
const scoped = [
  "orders", "order_finance", "order_history", "transports",
  "trips", "trip_events", "transport_updates",
];

test("Wave 1b scopes every legacy Private OS table and resets its privileges", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  for (const table of scoped) {
    assert.match(sql, new RegExp(`alter table public\\.${table}\\s+add column if not exists workspace_id`, "i"));
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`, "i"));
    assert.match(sql, new RegExp(`revoke all on public\\.${table} from anon, authenticated`, "i"));
  }
});

test("Wave 1b never grants delete and never exposes sensitive order columns", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  assert.doesNotMatch(sql, /grant[^;]*\bdelete\b[^;]*to authenticated/i);
  assert.doesNotMatch(sql, /for delete/i);
  const columnGrant = sql.match(/grant select \(([^)]*)\) on public\.orders to authenticated/i);
  assert.ok(columnGrant, "orders must use a column-level select grant");
  for (const column of ["total_price", "offer_comment", "calc_comment"]) {
    assert.doesNotMatch(columnGrant[1], new RegExp(`\\b${column}\\b`));
  }
});

test("Wave 1b infers no scope and keeps the backfill off the API surface", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  assert.match(
    sql,
    /revoke all on function public\.legacy_assign_order_scope\(uuid, uuid, uuid, text\)\s+from public, anon, authenticated/i
  );
  assert.doesNotMatch(sql, /profiles\.email|ilike|@gmail|exim\.kz/i);
  assert.doesNotMatch(sql, /\bdelete from\b|\bdrop table\b|\btruncate\b/i);
  assert.match(sql, /set search_path = ''/i);
  assert.doesNotMatch(sql, /set search_path = public/i);
});
