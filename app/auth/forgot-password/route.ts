import { NextResponse, type NextRequest } from "next/server";
import { sameOrigin } from "@/lib/auth/request";

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "Недопустимый источник запроса." }, { status: 403 });
  return NextResponse.json({ ok: true }, { status: 202 });
}
