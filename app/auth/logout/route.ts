import { NextResponse, type NextRequest } from "next/server";
import { destroySession, SESSION_COOKIE } from "@/lib/auth/session";
import { sameOrigin } from "@/lib/auth/request";

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) {
    return NextResponse.json({ error: "Недопустимый источник запроса." }, { status: 403 });
  }
  const response = NextResponse.json({ ok: true });
  await destroySession(request.cookies.get(SESSION_COOKIE)?.value, response);
  return response;
}
