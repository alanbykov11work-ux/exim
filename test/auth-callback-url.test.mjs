import test from "node:test";
import assert from "node:assert/strict";
import {
  callbackFailureUrl,
  safeInternalPath,
} from "../lib/auth/callback-url.mjs";

test("safeInternalPath keeps only same-origin paths", () => {
  assert.equal(safeInternalPath("/app?tab=orders"), "/app?tab=orders");
  assert.equal(safeInternalPath("//evil.example"), "/confirmed");
  assert.equal(safeInternalPath("https://evil.example"), "/confirmed");
  assert.equal(safeInternalPath("/auth/callback"), "/confirmed");
  assert.equal(safeInternalPath(null), "/confirmed");
});

test("callback failure is explicit and remains on the EXIM origin", () => {
  const url = callbackFailureUrl("https://app.exim.example", "invalid_or_expired");
  assert.equal(url.origin, "https://app.exim.example");
  assert.equal(url.pathname, "/login");
  assert.equal(url.searchParams.get("auth_error"), "invalid_or_expired");
  assert.equal(url.searchParams.has("verified"), false);
});

test("return target after login stays inside the app (no open redirect)", async () => {
  const { safeReturnTarget } = await import("../lib/auth/callback-url.mjs");
  const id = "10000000-0000-4000-8000-0000000000a1";
  assert.equal(safeReturnTarget("/app", "#/order/" + id), "/app#/order/" + id);
  assert.equal(safeReturnTarget(null, "#/shipment/" + id), "/app#/shipment/" + id);
  assert.equal(safeReturnTarget("/app", "#/inbox"), "/app#/inbox");
  for (const bad of ["https://evil.example/app", "//evil.example", "/login", "/auth/callback", "/admin", "javascript:alert(1)"]) {
    assert.equal(safeReturnTarget(bad, ""), "/app", bad);
  }
  for (const h of ["#//evil", "#/order/" + id + "/x", "#/<script>", "#javascript:alert(1)", "#/order/%2F%2Fevil"]) {
    assert.equal(safeReturnTarget("/app", h), "/app", h);
  }
});
