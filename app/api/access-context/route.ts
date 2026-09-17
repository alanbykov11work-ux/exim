import { NextResponse, type NextRequest } from "next/server";
import { sameOrigin } from "@/lib/auth/request";
import {
  currentSessionUser,
  listActorContexts,
  selectActorContext,
} from "@/lib/auth/session";

export async function GET() {
  const user = await currentSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const result = await listActorContexts();
  if (!result) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json({
    data: result.contexts,
    activeMembershipId: result.activeMembershipId,
  });
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const body = await request.json().catch(() => ({}));
  const membershipId = String(body.membership_id ?? "").trim();
  if (!/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(membershipId)) {
    return NextResponse.json({ error: "invalid_membership" }, { status: 400 });
  }
  const context = await selectActorContext(membershipId);
  if (!context) {
    return NextResponse.json({ error: "context_not_available" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, data: context });
}
