import { NextResponse, type NextRequest } from "next/server";
import { currentActor } from "@/lib/auth/session";
import { sameOrigin } from "@/lib/auth/request";
import { query } from "@/lib/db";

const KEY_RE = /^exim-[a-z0-9:_-]{1,100}$/i;
const MAX_VALUE_BYTES = 512 * 1024;

export async function GET() {
  const actor = await currentActor();
  if (!actor) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const result = await query<{ key: string; value: unknown }>(
    "select key, value from user_state where workspace_id = $1 and user_id = $2 order by key",
    [actor.workspaceId, actor.id]
  );
  return NextResponse.json({ data: result.rows });
}

export async function PUT(request: NextRequest) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const actor = await currentActor();
  if (!actor) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const key = String(body.key || "");
  const value = body.value;
  if (!KEY_RE.test(key) || Buffer.byteLength(JSON.stringify(value ?? null)) > MAX_VALUE_BYTES) {
    return NextResponse.json({ error: "invalid state" }, { status: 400 });
  }
  await query(
    `insert into user_state (workspace_id, user_id, key, value)
     values ($1, $2, $3, $4::jsonb)
     on conflict (workspace_id, user_id, key)
     do update set value = excluded.value, updated_at = now()`,
    [actor.workspaceId, actor.id, key, JSON.stringify(value ?? null)]
  );
  return NextResponse.json({ ok: true });
}
