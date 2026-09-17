import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";

const baseUrl = process.env.BASE_URL || "http://exim-superapp:3000";

function identity(label) {
  const suffix = `${Date.now()}-${randomBytes(4).toString("hex")}`;
  return {
    label,
    email: `synthetic-${label}-${suffix}@example.invalid`,
    password: randomBytes(18).toString("base64url"),
    cookie: "",
  };
}

async function request(identity, path, options = {}) {
  const headers = new Headers(options.headers || {});
  if (identity?.cookie) headers.set("cookie", identity.cookie);
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers,
    redirect: options.redirect || "manual",
  });
  const setCookie = response.headers.get("set-cookie");
  if (identity && setCookie) identity.cookie = setCookie.split(";", 1)[0];
  return response;
}

async function register(identity) {
  const response = await request(identity, "/auth/password-register", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email: identity.email,
      password: identity.password,
      full_name: `Synthetic ${identity.label}`,
      company: `Synthetic ${identity.label} Co`,
      phone: "+70000000000",
    }),
  });
  const body = await response.json();
  assert.equal(response.status, 200, JSON.stringify(body));
  assert.equal(body.confirmed, true);
  assert.match(identity.cookie, /^__Host-exim_session=/);
}

const tenantA = identity("tenant-a");
const tenantB = identity("tenant-b");
await register(tenantA);
await register(tenantB);

for (const actor of [tenantA, tenantB]) {
  const session = await request(actor, "/auth/session");
  assert.equal(session.status, 200);
  assert.equal((await session.json()).authenticated, true);

  const putState = await request(actor, "/api/state", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ key: "exim-smoke", value: { tenant: actor.label } }),
  });
  assert.equal(putState.status, 200);
  const state = await request(actor, "/api/state");
  const stateBody = await state.json();
  assert.equal(stateBody.data.find((row) => row.key === "exim-smoke")?.value?.tenant, actor.label);
}

const fileName = `smoke-${Date.now()}.txt`;
const uploadForm = new FormData();
uploadForm.set("folder", "smoke");
uploadForm.set("file", new File(["tenant-a-only"], fileName, { type: "text/plain" }));
const upload = await request(tenantA, "/api/files", { method: "POST", body: uploadForm });
assert.equal(upload.status, 201, await upload.text());

const listA = await request(tenantA, "/api/files?folder=smoke");
assert.equal((await listA.json()).data.length, 1);
const listB = await request(tenantB, "/api/files?folder=smoke");
assert.equal((await listB.json()).data.length, 0);

const probePath = `/api/files/resolve?folder=smoke&name=${encodeURIComponent(fileName)}`;
const denied = await request(tenantB, probePath);
assert.equal(denied.status, 404);
const allowed = await request(tenantA, probePath);
assert.equal(allowed.status, 200);
assert.equal(await allowed.text(), "tenant-a-only");
const removed = await request(tenantA, probePath, { method: "DELETE" });
assert.equal(removed.status, 200);

const snapshot = await request(tenantA, "/api/workflow/snapshot");
assert.equal(snapshot.status, 200);
const snapshotBody = await snapshot.json();
assert.deepEqual(snapshotBody.data.orders, []);
assert.deepEqual(snapshotBody.data.transports, []);

const callback = await request(null, "/auth/callback", { redirect: "manual" });
assert.equal(callback.status, 307);
assert.match(callback.headers.get("location") || "", /auth_error=verification_unavailable/);

for (const actor of [tenantA, tenantB]) {
  const logout = await request(actor, "/auth/logout", { method: "POST" });
  assert.equal(logout.status, 200);
}

console.log(JSON.stringify({
  ok: true,
  tested: ["registration", "session", "state", "documents", "tenant-denial", "workflow-read", "callback", "logout"],
}));
