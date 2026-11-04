import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, chmodSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

// Runners must refuse an unconfirmed or non-local target BEFORE touching any database.
// psql/pg_dump/pg_restore are replaced by stubs that only record that they were called.
const ROOT = path.resolve(new URL("..", import.meta.url).pathname);
const STUBS = mkdtempSync(path.join(tmpdir(), "exim-stub-"));
const CALLS = path.join(STUBS, "calls.log");
for (const bin of ["psql", "pg_dump", "pg_restore", "postgrest-stub"]) {
  const p = path.join(STUBS, bin);
  writeFileSync(p, `#!/usr/bin/env bash\necho "${bin} called" >> "${CALLS}"\nexit 0\n`);
  chmodSync(p, 0o755);
}
const CONFIRM = { EXIM_DISPOSABLE_CONFIRM: "yes-disposable-local-instance" };
function run(script, env) {
  try { writeFileSync(CALLS, ""); } catch {}
  const r = spawnSync("bash", [path.join(ROOT, "scripts/local-stack", script)], {
    env: { PATH: `${STUBS}:/usr/bin:/bin`, POSTGREST_BIN: path.join(STUBS, "postgrest-stub"), ...env },
    encoding: "utf8", timeout: 20000,
  });
  const calls = existsSync(CALLS) ? readFileSync(CALLS, "utf8").trim() : "";
  return { code: r.status, stderr: r.stderr, calls };
}

const ADMIN_RUNNERS = ["reset-and-run.sh", "real-ui.sh", "rollback-rehearsal.sh"];
const badAdmin = [
  ["no confirmation", { PG_ADMIN_URL: "postgresql://postgres@/postgres?host=/tmp" }],
  ["confirmation with wrong value", { EXIM_DISPOSABLE_CONFIRM: "yes", PG_ADMIN_URL: "postgresql://postgres@/postgres?host=/tmp" }],
  ["missing URL", { ...CONFIRM }],
  ["empty URL", { ...CONFIRM, PG_ADMIN_URL: "" }],
  ["not a postgres URL", { ...CONFIRM, PG_ADMIN_URL: "mysql://root@localhost/postgres" }],
  ["remote host", { ...CONFIRM, PG_ADMIN_URL: "postgresql://postgres:x@db.example.com:5432/postgres" }],
  ["hosted Supabase host", { ...CONFIRM, PG_ADMIN_URL: "postgresql://postgres:x@db.abcdefgh.supabase.co:5432/postgres" }],
  ["Supabase pooler", { ...CONFIRM, PG_ADMIN_URL: "postgresql://postgres.x:y@aws-0-eu.pooler.supabase.com:6543/postgres" }],
  ["remote host= parameter", { ...CONFIRM, PG_ADMIN_URL: "postgresql://postgres@/postgres?host=db.example.com" }],
  ["admin URL not on the maintenance db", { ...CONFIRM, PG_ADMIN_URL: "postgresql://postgres@localhost/app_prod" }],
  ["allow-list does not match", { ...CONFIRM, EXIM_ALLOWED_DB_HOST: "10.0.0.5", PG_ADMIN_URL: "postgresql://postgres@10.0.0.6/postgres" }],
];
for (const script of ADMIN_RUNNERS) {
  for (const [name, env] of badAdmin) {
    test(`${script} refuses (${name}) with zero database calls`, () => {
      const r = run(script, env);
      assert.notEqual(r.code, 0, r.stderr);
      assert.equal(r.calls, "", "a database tool was called: " + r.calls);
      assert.ok(!/x@|:x@|postgres:x/.test(r.stderr), "URL secrets must not be printed");
    });
  }
}

test("reset-and-run.sh refuses a custom database name outside exim_*", () => {
  const r = run("reset-and-run.sh", { ...CONFIRM, PG_ADMIN_URL: "postgresql://postgres@/postgres?host=/tmp", EXIM_LOCAL_DB: "production" });
  assert.notEqual(r.code, 0); assert.equal(r.calls, "");
});

for (const [name, env] of [
  ["no confirmation", { DATABASE_URL: "postgresql://postgres@/exim_x?host=/tmp" }],
  ["work db not exim_*", { ...CONFIRM, DATABASE_URL: "postgresql://postgres@/postgres?host=/tmp" }],
  ["remote host", { ...CONFIRM, DATABASE_URL: "postgresql://u:x@db.example.com/exim_x" }],
]) {
  test(`apply.sh refuses (${name}) with zero database calls`, () => {
    const r = run("apply.sh", env);
    assert.notEqual(r.code, 0); assert.equal(r.calls, "");
  });
}

test("preflight accepts only a confirmed local disposable instance (no database call)", () => {
  for (const [kind, url, extra] of [
    ["admin", "postgresql://postgres@/postgres?host=/tmp&port=54329", {}],
    ["admin", "postgresql://postgres@localhost:5432/postgres", {}],
    ["admin", "postgres://postgres@127.0.0.1/postgres", {}],
    ["admin", "postgresql://postgres@10.0.0.5/postgres", { EXIM_ALLOWED_DB_HOST: "10.0.0.5" }],
    ["work", "postgresql://postgres@/exim_local_1?host=/tmp", {}],
  ]) {
    const r = spawnSync("bash", ["-c", `. "${ROOT}/scripts/local-stack/preflight.sh"; exim_preflight ${kind} "$U"; echo OK`],
      { env: { PATH: `${STUBS}:/usr/bin:/bin`, U: url, ...CONFIRM, ...extra }, encoding: "utf8" });
    assert.equal(r.stdout.trim(), "OK", `${kind} ${url}: ${r.stderr}`);
  }
});
