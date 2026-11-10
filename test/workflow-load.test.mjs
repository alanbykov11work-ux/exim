import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

// Loads workflow.js against a scripted fake Supabase client.
// script(name) returns the response for each request: an object, a thrown error, or a rejected promise.
async function load(script, role = "manager") {
  const source = await readFile(new URL("../public/exim/workflow.js", import.meta.url), "utf8");
  const calls = [];
  const respond = (name) => { calls.push(name); return script(name, calls.filter((c) => c === name).length); };
  const query = (name) => {
    const q = {
      select: () => q, order: () => q, in: () => q, eq: () => q,
      then: (ok, bad) => Promise.resolve().then(() => respond(name)).then(ok, bad),
    };
    return q;
  };
  const supa = {
    rpc: (fn) => ({ then: (ok, bad) => Promise.resolve().then(() => respond("rpc:" + fn)).then(ok, bad) }),
    from: (table) => query(table),
  };
  const window = { __SUPA: supa, __EXIM: { id: "u1", role, workspaceId: "ws1" }, navigate: () => {} };
  const document = { getElementById: () => null, querySelectorAll: () => [] };
  vm.runInNewContext(source, { window, document, setTimeout: () => 0, console });
  return { WF: window.WF, calls };
}

const ok = (data) => ({ data, error: null });
const happy = (name) => ({
  "rpc:orders_scoped": ok([{ id: "o1", status: "new" }]),
  transports: ok([{ id: "t1", status: "in_transit" }]),
  client_companies: ok([{ id: "c1", name: "A1" }]),
  order_finance: ok([]),
  profiles: ok([]),
}[name] || ok([]));

const failures = {
  "401 unauthorized": { data: null, error: { code: "PGRST301", status: 401, message: "JWT expired" } },
  "403 forbidden": { data: null, error: { code: "42501", status: 403, message: "permission denied" } },
  "500 server error": { data: null, error: { code: "XX000", status: 500, message: "internal" } },
  "null data without error": { data: null, error: null },
};

for (const [label, failure] of Object.entries(failures)) {
  test(`load error is surfaced, not turned into empty data: ${label}`, async () => {
    const { WF } = await load((name) => (name === "rpc:orders_scoped" ? failure : happy(name)));
    await assert.rejects(WF.getData(), (e) => { assert.ok(e instanceof Error || e.message); return true; });
  });
}

test("network failure (thrown / rejected promise) is surfaced", async () => {
  const { WF } = await load((name) => {
    if (name === "transports") throw new TypeError("Failed to fetch");
    return happy(name);
  });
  await assert.rejects(WF.getData(), /Failed to fetch/);
  const { WF: WF2 } = await load((name) => (name === "profiles" ? Promise.reject(new Error("socket hang up")) : happy(name)));
  await assert.rejects(WF2.getData(), /socket hang up/);
});

test("a failure in any required query fails the whole load (no partial success)", async () => {
  for (const bad of ["transports", "client_companies", "order_finance", "profiles"]) {
    const { WF } = await load((name) => (name === bad ? failures["500 server error"] : happy(name)));
    await assert.rejects(WF.getData(), undefined, bad);
  }
});

test("retry after an error really goes to the server and then succeeds", async () => {
  const { WF, calls } = await load((name, n) => (name === "rpc:orders_scoped" && n === 1 ? failures["403 forbidden"] : happy(name)));
  await assert.rejects(WF.getData());
  const data = await WF.getData();
  assert.equal(calls.filter((c) => c === "rpc:orders_scoped").length, 2);
  assert.equal(data.orders.length, 1);
  assert.equal(data.transports.length, 1);
  // a fresh successful load is cached
  await WF.getData();
  assert.equal(calls.filter((c) => c === "rpc:orders_scoped").length, 2);
});

test("an empty list is returned only after a successful server answer", async () => {
  const { WF } = await load((name) => (name === "rpc:orders_scoped" || name === "transports" ? ok([]) : happy(name)));
  const data = await WF.getData();
  assert.equal(data.orders.length, 0);
  assert.equal(data.transports.length, 0);
});
