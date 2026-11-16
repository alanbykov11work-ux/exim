import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const ids = {
  org: "10000000-0000-4000-8000-000000000001",
  orgB: "10000000-0000-4000-8000-000000000002",
  ws: "20000000-0000-4000-8000-000000000001",
  wsB: "20000000-0000-4000-8000-000000000002",
  a1: "30000000-0000-4000-8000-000000000001",
  a2: "30000000-0000-4000-8000-000000000002",
  b1: "30000000-0000-4000-8000-000000000003",
  clientA1: "40000000-0000-4000-8000-000000000001",
  clientA2: "40000000-0000-4000-8000-000000000002",
  manager: "40000000-0000-4000-8000-000000000003",
  clientB1: "40000000-0000-4000-8000-000000000004",
  logist: "40000000-0000-4000-8000-000000000005",
};
const sqlFile = (name) => readFile(new URL(`../supabase/${name}`, import.meta.url), "utf8");

async function as(db, user) {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [user]);
  await db.exec("set role authenticated");
}

test("request attachments: folder scope, owner, type from storage", async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create publication supabase_realtime;
    create schema auth;
    create schema storage;
    create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
    create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text,
      owner uuid default nullif(current_setting('request.jwt.claim.sub', true), '')::uuid, metadata jsonb, unique (bucket_id, name));
    alter table storage.objects enable row level security;
    create function storage.foldername(name text) returns text[] language sql immutable
      as $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
    grant usage on schema storage to authenticated;
    grant select, insert on storage.objects to authenticated;
    create table auth.users (id uuid primary key);
    create or replace function auth.uid() returns uuid language sql stable
      as $$ select coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''), (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'))::uuid $$;
    create table public.profiles (id uuid primary key references auth.users(id), email text,
      full_name text, company text, phone text, bin text, role text not null default 'client',
      verified boolean not null default false);
    alter table public.profiles enable row level security;
    create or replace function public.touch_updated_at() returns trigger language plpgsql
      as $$ begin new.updated_at = now(); return new; end $$;
    create or replace function public.admin_set_role(p_user uuid, p_role text)
      returns void language sql as $$ select 1 $$;
  `);
  for (const f of ["workflow.sql", "chats_tasks.sql", "badges.sql", "crm.sql", "foundation_wave_1.sql", "foundation_wave_1b_legacy_scope.sql", "foundation_wave_1c_work_scope.sql", "foundation_wave_3a_rate_quotes.sql", "foundation_wave_3b_offers.sql", "foundation_wave_3c_revisions.sql", "foundation_wave_3d_request_form.sql", "foundation_wave_3e_clarifications.sql"]) {
    await db.exec(await sqlFile(f));
  }
  for (const id of [ids.clientA1, ids.clientA2, ids.manager, ids.clientB1, ids.logist]) {
    await db.query("insert into auth.users values ($1)", [id]);
    await db.query("insert into public.profiles(id) values ($1)", [id]);
  }
  await db.query("insert into public.organizations(id, name, slug) values ($1,'A','org-a'),($2,'B','org-b')", [ids.org, ids.orgB]);
  await db.query("insert into public.tenant_workspaces(id, organization_id, name, slug) values ($1,$2,'A','ws-a'),($3,$4,'B','ws-b')", [ids.ws, ids.org, ids.wsB, ids.orgB]);
  await db.query("insert into public.client_companies(id, workspace_id, name) values ($1,$2,'A1'),($3,$2,'A2'),($4,$5,'B1')", [ids.a1, ids.ws, ids.a2, ids.b1, ids.wsB]);
  await db.query(
    `insert into public.workspace_memberships(workspace_id, user_id, role, client_company_id) values
     ($1,$2,'client',$3),($1,$4,'client',$5),($1,$6,'manager',null),($1,$10,'logistician',null),($7,$8,'client',$9)`,
    [ids.ws, ids.clientA1, ids.a1, ids.clientA2, ids.a2, ids.manager, ids.wsB, ids.clientB1, ids.b1, ids.logist]
  );
  await db.query("insert into public.module_entitlements values ($1,'private_os',true),($2,'private_os',true)", [ids.ws, ids.wsB]);

  await db.exec(await sqlFile("foundation_wave_3f_attachments.sql"));
  const full = { contact_name: "Иван", origin: "Урумчи", destination: "Алматы", cargo: "текстиль", weight_kg: "1000", volume_m3: "10" };
  await as(db, ids.clientA1);
  const order = (await db.query("select * from public.save_request($1,$2,$3::jsonb,true)",
    ["50000000-0000-4000-8000-000000000010", ids.a1, JSON.stringify(full)])).rows[0].order_id;
  const path = (n) => `${ids.ws}/${order}/${n}`;
  const put = (name, mime = "image/jpeg") => db.query(
    "insert into storage.objects(bucket_id, name, metadata) values ('request-files', $1, $2::jsonb)",
    [name, JSON.stringify({ mimetype: mime, size: 1234 })]);

  await put(path("a-photo.jpg"));
  const id = (await db.query("select public.register_attachment($1,$2,'photo.jpg') id", [order, path("a-photo.jpg")])).rows[0].id;
  assert.ok(id);
  // idempotent
  assert.equal((await db.query("select public.register_attachment($1,$2,'photo.jpg') id", [order, path("a-photo.jpg")])).rows[0].id, id);
  await assert.rejects(put(`${ids.wsB}/${order}/x.jpg`));
  await assert.rejects(put(`${ids.ws}/not-a-uuid/x.jpg`));
  await assert.rejects(db.query("select public.register_attachment($1,$2,'x')", [order, "other/x.jpg"]), /outside/);
  await put(path("b.exe"), "application/x-msdownload");
  await assert.rejects(db.query("select public.register_attachment($1,$2,'b.exe')", [order, path("b.exe")]), /not allowed/);

  await as(db, ids.clientA2);
  await assert.rejects(put(path("c.jpg")));
  assert.equal((await db.query("select count(*)::int n from storage.objects")).rows[0].n, 0);
  assert.equal((await db.query("select count(*)::int n from public.order_attachments")).rows[0].n, 0);
  await as(db, ids.manager);
  await put(path("d.pdf"), "application/pdf");
  // someone else's object cannot be registered by the manager
  await assert.rejects(db.query("select public.register_attachment($1,$2,'a')", [order, path("a-photo.jpg")]), /not found/);
  await db.query("select public.register_attachment($1,$2,'d.pdf')", [order, path("d.pdf")]);
  const kinds = (await db.query("select kind, size_bytes::int s from public.order_attachments order by kind")).rows;
  assert.equal(JSON.stringify(kinds), JSON.stringify([{ kind: "document", s: 1234 }, { kind: "photo", s: 1234 }]));
  await as(db, ids.clientB1);
  assert.equal((await db.query("select count(*)::int n from public.order_attachments")).rows[0].n, 0);
  await assert.rejects(db.query("update storage.objects set name = 'x'"));
});
