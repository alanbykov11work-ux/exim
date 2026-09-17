import test from "node:test";
import assert from "node:assert/strict";
import { isAllowedRequestOrigin } from "../lib/auth/origin-policy.mjs";

test("allows the URL observed directly by Next.js", () => {
  assert.equal(
    isAllowedRequestOrigin(
      "http://localhost:3000",
      "http://localhost:3000",
      undefined
    ),
    true
  );
});

test("allows the configured public origin behind a reverse proxy", () => {
  assert.equal(
    isAllowedRequestOrigin(
      "https://superapp.185-129-49-242.sslip.io",
      "http://exim-superapp:3000",
      "https://superapp.185-129-49-242.sslip.io/app"
    ),
    true
  );
});

test("rejects a foreign origin even when the app is reverse proxied", () => {
  assert.equal(
    isAllowedRequestOrigin(
      "https://attacker.example",
      "http://exim-superapp:3000",
      "https://superapp.185-129-49-242.sslip.io/app"
    ),
    false
  );
});

test("rejects malformed and path-bearing Origin headers", () => {
  assert.equal(
    isAllowedRequestOrigin(
      "https://superapp.185-129-49-242.sslip.io/app",
      "http://exim-superapp:3000",
      "https://superapp.185-129-49-242.sslip.io/app"
    ),
    false
  );
  assert.equal(
    isAllowedRequestOrigin(
      "not a URL",
      "http://exim-superapp:3000",
      "https://superapp.185-129-49-242.sslip.io/app"
    ),
    false
  );
});

test("keeps non-browser requests without Origin compatible", () => {
  assert.equal(
    isAllowedRequestOrigin(
      null,
      "http://exim-superapp:3000",
      "https://superapp.185-129-49-242.sslip.io/app"
    ),
    true
  );
});
