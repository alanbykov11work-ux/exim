import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, chmodSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Runners must refuse an unconfirmed or non-local target BEFORE touching any database.
// psql/pg_dump/pg_restore are replaced by stubs that only record that they were called.
// A test passes only if bash really started, exited with status 2 and printed the preflight marker.
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PREFLIGHT = path.join(ROOT, "scripts/local-stack/preflight.sh");
const MARKER = "Refusing (local-stack preflight)";

function findBash() {
  if (process.env.EXIM_TEST_BASH) return existsSync(process.env.EXIM_TEST_BASH) ? process.env.EXIM_TEST_BASH : null;
  if (process.platform === "win32") return null; // runners are POSIX-only; reported as skipped, not passed
  for (const p of ["/bin/bash", "/usr/bin/bash", "/usr/local/bin/bash", "/opt/homebrew/bin/bash"]) if (existsSync(p)) return p;
  return null;
}
const BASH = findBash();
const SKIP = BASH ? false : `NOT_RUN: no bash on ${process.platform}; local-stack preflight not verified`;

const STUBS = mkdtempSync(path.join(tmpdir(), "exim-stub-"));
const CALLS = path.join(STUBS, "calls.log");
for (const bin of ["psql", "pg_dump", "pg_restore", "postgrest-stub", "createdb", "dropdb"]) {
  const p = path.join(STUBS, bin);
  writeFileSync(p, `#!/bin/sh\necho "${bin} called" >> "${CALLS}"\nexit 0\n`);
  chmodSync(p, 0o755);
}
const BASE_ENV = { PATH: `${STUBS}:/usr/bin:/bin`, POSTGREST_BIN: path.join(STUBS, "postgrest-stub") };
const CONFIRM = { EXIM_DISPOSABLE_CONFIRM: "yes-disposable-local-instance" };

function spawnChecked(bin, args, env) {
  writeFileSync(CALLS, "");
  const r = spawnSync(bin, args, { env: { ...BASE_ENV, ...env }, encoding: "utf8", timeout: 20000 });
  const calls = readFileSync(CALLS, "utf8").trim();
  return { error: r.error, signal: r.signal, status: r.status, stdout: r.stdout ?? "", stderr: r.stderr ?? "", calls };
}
function assertRefused(r, secret = "x") {
  assert.equal(r.error, undefined, "bash did not start: " + r.error);
  assert.equal(r.signal, null, "killed by signal " + r.signal);
  assert.equal(r.status, 2, `expected exit 2, got ${r.status}; stderr: ${r.stderr}`);
  assert.ok(r.stderr.includes(MARKER), "preflight marker missing; stderr: " + r.stderr);
  assert.equal(r.calls, "", "a database tool was called: " + r.calls);
  assert.ok(!r.stderr.includes("postgres:" + secret + "@") && !r.stderr.includes("://"), "URL or password printed");
}
const runScript = (script, env) => spawnChecked(BASH, [path.join(ROOT, "scripts/local-stack", script)], env);
const runPreflight = (kind, url, env = {}, file = PREFLIGHT) =>
  spawnChecked(BASH, ["-c", `set -e; . "$PF"; exim_preflight ${kind} "$U"; echo PREFLIGHT_OK`], { PF: file, U: url, ...env });

// --- harness self-tests: the harness must not turn "could not run" into PASS ---
test("self-test: a non-launchable bash is reported as a failure, not a pass", { skip: SKIP }, () => {
  const r = spawnChecked(path.join(STUBS, "no-such-bash"), ["-c", "true"], {});
  assert.ok(r.error, "spawn error expected");
  assert.throws(() => assertRefused(r));
});
test("self-test: a broken preflight source is not accepted as a refusal or a pass", { skip: SKIP }, () => {
  const broken = path.join(STUBS, "broken-preflight.sh");
  writeFileSync(broken, "exim_preflight() { \n");
  const r = runPreflight("admin", "postgresql://postgres@localhost/postgres", CONFIRM, broken);
  assert.notEqual(r.stdout.trim(), "PREFLIGHT_OK");
  assert.throws(() => assertRefused(r));
  const missing = runPreflight("admin", "postgresql://postgres@localhost/postgres", CONFIRM, path.join(STUBS, "absent.sh"));
  assert.notEqual(missing.stdout.trim(), "PREFLIGHT_OK");
  assert.throws(() => assertRefused(missing));
});

const ADMIN_RUNNERS = ["reset-and-run.sh", "real-ui.sh", "rollback-rehearsal.sh"];
const ADMIN_OK = "postgresql://postgres@/postgres?host=/tmp";
const badAdmin = [
  ["no confirmation", { PG_ADMIN_URL: ADMIN_OK }],
  ["confirmation with wrong value", { EXIM_DISPOSABLE_CONFIRM: "yes", PG_ADMIN_URL: ADMIN_OK }],
  ["missing URL", { ...CONFIRM }],
  ["empty URL", { ...CONFIRM, PG_ADMIN_URL: "" }],
  ["not a postgres URL", { ...CONFIRM, PG_ADMIN_URL: "mysql://root@localhost/postgres" }],
  ["remote host", { ...CONFIRM, PG_ADMIN_URL: "postgresql://postgres:x@db.example.com:5432/postgres" }],
  ["hosted Supabase host", { ...CONFIRM, PG_ADMIN_URL: "postgresql://postgres:x@db.abcdefgh.supabase.co:5432/postgres" }],
  ["Supabase pooler", { ...CONFIRM, PG_ADMIN_URL: "postgresql://postgres.x:x@aws-0-eu.pooler.supabase.com:6543/postgres" }],
  ["remote host= parameter", { ...CONFIRM, PG_ADMIN_URL: "postgresql://postgres@/postgres?host=db.example.com" }],
  ["admin URL not on the maintenance db", { ...CONFIRM, PG_ADMIN_URL: "postgresql://postgres@localhost/app_prod" }],
  ["allow-list does not match", { ...CONFIRM, EXIM_ALLOWED_DB_HOST: "10.0.0.5", PG_ADMIN_URL: "postgresql://postgres@10.0.0.6/postgres" }],
  // Codex review 2026-11-04 bypasses
  ["hostaddr override", { ...CONFIRM, PG_ADMIN_URL: "postgresql://postgres@localhost/postgres?hostaddr=203.0.113.10" }],
  ["repeated host=", { ...CONFIRM, PG_ADMIN_URL: "postgresql://postgres@/postgres?host=localhost&host=db.example.com" }],
  ["authority host plus host=", { ...CONFIRM, PG_ADMIN_URL: "postgresql://postgres@localhost/postgres?host=db.example.com" }],
  ["dbname override", { ...CONFIRM, PG_ADMIN_URL: "postgresql://postgres@localhost/postgres?dbname=production" }],
  ["service override", { ...CONFIRM, PG_ADMIN_URL: "postgresql://postgres@localhost/postgres?service=prod" }],
  ["options parameter", { ...CONFIRM, PG_ADMIN_URL: "postgresql://postgres@localhost/postgres?options=-csearch_path%3Dx" }],
  ["percent-encoded host", { ...CONFIRM, PG_ADMIN_URL: "postgresql://postgres@/postgres?host=db%2Eexample%2Ecom" }],
  ["percent-encoded dbname", { ...CONFIRM, PG_ADMIN_URL: "postgresql://postgres@localhost/%70roduction" }],
  ["multi-host authority", { ...CONFIRM, PG_ADMIN_URL: "postgresql://postgres@localhost,db.example.com/postgres" }],
  ["password with secret", { ...CONFIRM, PG_ADMIN_URL: "postgresql://postgres:x@localhost/postgres?hostaddr=203.0.113.10" }],
  ...["PGHOST", "PGHOSTADDR", "PGDATABASE", "PGSERVICE", "PGSERVICEFILE", "PGSYSCONFDIR", "PGPASSFILE", "PGPORT"].map(
    (v) => [`inherited ${v}`, { ...CONFIRM, PG_ADMIN_URL: ADMIN_OK, [v]: v === "PGPORT" ? "6543" : "db.example.com" }]),
];
for (const script of ADMIN_RUNNERS) {
  for (const [name, env] of badAdmin) {
    test(`${script} refuses (${name}) before any database call`, { skip: SKIP }, () => assertRefused(runScript(script, env)));
  }
}

test("reset-and-run.sh refuses a custom database name outside exim_*", { skip: SKIP }, () =>
  assertRefused(runScript("reset-and-run.sh", { ...CONFIRM, PG_ADMIN_URL: ADMIN_OK, EXIM_LOCAL_DB: "production" })));

for (const [name, env] of [
  ["no confirmation", { DATABASE_URL: "postgresql://postgres@/exim_x?host=/tmp" }],
  ["work db not exim_*", { ...CONFIRM, DATABASE_URL: "postgresql://postgres@/postgres?host=/tmp" }],
  ["remote host", { ...CONFIRM, DATABASE_URL: "postgresql://u:x@db.example.com/exim_x" }],
  ["dbname override", { ...CONFIRM, DATABASE_URL: "postgresql://postgres@/exim_x?host=/tmp&dbname=production" }],
  ["hostaddr override", { ...CONFIRM, DATABASE_URL: "postgresql://postgres@localhost/exim_x?hostaddr=203.0.113.10" }],
  ["inherited PGDATABASE", { ...CONFIRM, DATABASE_URL: "postgresql://postgres@/exim_x?host=/tmp", PGDATABASE: "production" }],
]) {
  test(`apply.sh refuses (${name}) before any database call`, { skip: SKIP }, () => assertRefused(runScript("apply.sh", env)));
}

test("preflight really sources and accepts only a confirmed local disposable instance", { skip: SKIP }, () => {
  for (const [kind, url, extra] of [
    ["admin", "postgresql://postgres@/postgres?host=/tmp&port=54329", {}],
    ["admin", "postgresql://postgres@localhost:5432/postgres", {}],
    ["admin", "postgres://postgres@127.0.0.1/postgres", {}],
    ["admin", "postgresql://postgres@[::1]:5432/postgres", {}],
    ["admin", "postgresql://postgres@10.0.0.5/postgres", { EXIM_ALLOWED_DB_HOST: "10.0.0.5" }],
    ["work", "postgresql://postgres@/exim_local_1?host=/tmp", {}],
  ]) {
    const r = runPreflight(kind, url, { ...CONFIRM, ...extra });
    assert.equal(r.error, undefined); assert.equal(r.signal, null);
    assert.equal(r.status, 0, `${kind} ${url}: ${r.stderr}`);
    assert.equal(r.stdout.trim(), "PREFLIGHT_OK");
    assert.equal(r.calls, "");
  }
});

test("preflight function refuses each Codex bypass URL directly (exit 2, marker)", { skip: SKIP }, () => {
  for (const url of [
    "postgresql://postgres@localhost/postgres?hostaddr=203.0.113.10",
    "postgresql://postgres@/postgres?host=localhost&host=db.example.com",
    "postgresql://postgres@localhost/postgres?dbname=production",
  ]) assertRefused(runPreflight("admin", url, CONFIRM));
});
