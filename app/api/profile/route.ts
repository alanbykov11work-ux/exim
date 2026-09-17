import { NextResponse, type NextRequest } from "next/server";
import { authorizeActor } from "@/lib/auth/authorize";
import { sameOrigin } from "@/lib/auth/request";
import { query } from "@/lib/db";

function clean(value: unknown, max: number) {
  return String(value ?? "").trim().slice(0, max);
}

export async function PATCH(request: NextRequest) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const access = await authorizeActor({ moduleKey: "private_os" });
  if (!access.ok) return access.response;
  const { actor } = access;
  const body = await request.json().catch(() => ({}));
  await query(
    `update profiles
        set full_name = $2, company = $3, phone = $4, bin = $5, updated_at = now()
      where id = $1`,
    [actor.id, clean(body.full_name, 160), clean(body.company, 200), clean(body.phone, 40), clean(body.bin, 32)]
  );
  return NextResponse.json({ ok: true });
}
