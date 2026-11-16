import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migrationUrl = new URL("../supabase/foundation_wave_1c_work_scope.sql", import.meta.url);
const tables = [
  "leads", "lead_history", "tasks", "task_comments",
  "chats", "chat_members", "chat_messages",
];

test("Wave 1c enables RLS and resets privileges on every work table", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  for (const table of tables) {
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`, "i"));
    assert.match(sql, new RegExp(`revoke all on public\\.${table} from anon, authenticated`, "i"));
  }
});

test("Wave 1c grants no delete and no direct chat or membership writes", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  assert.doesNotMatch(sql, /grant[^;]*\bdelete\b[^;]*to authenticated/i);
  assert.doesNotMatch(sql, /for delete/i);
  assert.match(sql, /grant select on public\.chats to authenticated/i);
  assert.doesNotMatch(sql, /grant[^;]*insert[^;]*on public\.chats to authenticated/i);
  assert.doesNotMatch(sql, /grant[^;]*insert[^;]*on public\.chat_members to authenticated/i);
  assert.match(sql, /grant update \(last_read_at\) on public\.chat_members to authenticated/i);
});

test("Wave 1c keeps the backfill off the API surface and infers nothing", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  assert.match(
    sql,
    /revoke all on function public\.legacy_assign_work_scope\(text, uuid, uuid, text\)\s+from public, anon, authenticated/i
  );
  assert.doesNotMatch(sql, /ilike|@gmail|exim\.kz/i);
  assert.doesNotMatch(sql, /\bdelete from\b|\bdrop table\b|\btruncate\b/i);
  assert.doesNotMatch(sql, /set search_path = public/i);
  assert.match(sql, /security invoker[\s\S]*update public\.orders/i, "decide_order must not bypass RLS");
});
