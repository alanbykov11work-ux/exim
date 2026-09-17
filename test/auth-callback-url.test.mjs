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
