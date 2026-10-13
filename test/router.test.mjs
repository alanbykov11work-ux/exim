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
const uuid = "20000000-0000-4000-8000-000000000001";

test("sections and typed object addresses round-trip", async () => {
  const { parse, format } = await loadRouter();
  assert.deepEqual(parse("#/workflow"), { page: "workflow", kind: null, id: null, invalid: false });
  assert.deepEqual(parse(format("workflow", uuid, "order")), { page: "workflow", kind: "order", id: uuid, invalid: false });
  assert.deepEqual(parse(format("workflow", uuid, "shipment")), { page: "workflow", kind: "shipment", id: uuid, invalid: false });
  assert.equal(format("workflow", uuid, "shipment"), "#/shipment/" + uuid);
  // legacy order address is still understood as an order
  assert.deepEqual(parse("#/workflow/" + uuid), { page: "workflow", kind: "order", id: uuid, invalid: false });
  assert.equal(parse(""), null);
  assert.equal(parse("#"), null);
});

test("malformed, hostile or over-long addresses are invalid and never throw", async () => {
  const { parse } = await loadRouter();
  for (const hash of [
    "#/workflow/%", "#/%E0%A4%A", "#/order/%zz",
    "#/workflow/a/ignored", "#/order/" + uuid + "/x", "#/order", "#/shipment/", "#//", "#/dashboard/123",
    "#/<img src=x onerror=alert(1)>", "#/Workflow", "#/../admin", "#/workflow/<script>", "#/workflow/a b",
    "#/" + "a".repeat(80),
  ]) {
    let r;
    assert.doesNotThrow(() => { r = parse(hash); }, hash);
    assert.equal(r.invalid, true, hash);
  }
});
