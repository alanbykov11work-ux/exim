import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

// Router helpers are pure; load the browser script into a bare context.
async function loadRouter() {
  const source = await readFile(new URL("../public/exim/router.js", import.meta.url), "utf8");
  const window = {};
  vm.runInNewContext(source, { window, document: {} });
  const router = window.__EXIM_ROUTER;
  // objects from another realm: compare as plain data
  const plain = (value) => (value === null ? null : JSON.parse(JSON.stringify(value)));
  return { parse: (hash) => plain(router.parse(hash)), format: router.format };
}

test("a stable address round-trips section and object", async () => {
  const { parse, format } = await loadRouter();
  assert.deepEqual(parse("#/workflow"), { page: "workflow", id: null, invalid: false });
  assert.deepEqual(parse(format("workflow", "ZK-1042")), { page: "workflow", id: "ZK-1042", invalid: false });
  const uuid = "20000000-0000-4000-8000-000000000001";
  assert.equal(parse(format("shipment-detail", uuid)).id, uuid);
  assert.equal(parse(""), null);
  assert.equal(parse("#"), null);
});

test("hostile or malformed addresses are refused, not executed", async () => {
  const { parse } = await loadRouter();
  for (const hash of [
    "#/<img src=x onerror=alert(1)>",
    "#/Workflow",
    "#/../admin",
    "#/workflow/<script>",
    "#/workflow/a b",
    "#/" + "a".repeat(80),
  ]) {
    assert.equal(parse(hash).invalid, true, hash);
  }
});
