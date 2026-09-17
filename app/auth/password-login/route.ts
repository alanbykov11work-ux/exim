import { NextResponse, type NextRequest } from "next/server";
import { query } from "@/lib/db";
import { sameOrigin, requestIp } from "@/lib/auth/request";
import { clearFailures, rateLimitStatus, recordFailure } from "@/lib/auth/rate-limit";
import { createSession } from "@/lib/auth/session";
import { verifyPassword } from "@/lib/auth/password";

const MAX_FAILURES = 5;
const WINDOW_SECONDS = 30 * 60;
const LOCK_SECONDS = 30 * 60;

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) {
    return NextResponse.json({ error: "Недопустимый источник запроса." }, { status: 403 });
  }
  const body = await request.json().catch(() => ({}));
  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");
  if (!email || !password) {
    return NextResponse.json({ error: "Укажите email и пароль." }, { status: 400 });
  }

  const key = `login:${email}:${requestIp(request)}`;
  const status = await rateLimitStatus(key, MAX_FAILURES);
  if (status.locked) {
    return NextResponse.json(
      { error: "Слишком много попыток. Попробуйте позже.", retry_after: status.retryAfter },
      { status: 429 }
    );
  }

  const result = await query<{
    id: string;
    password_hash: string;
    email_confirmed_at: string | null;
  }>(
    "select id, password_hash, email_confirmed_at from app_users where email = $1 limit 1",
    [email]
  );
  const user = result.rows[0];
  const valid = user ? await verifyPassword(password, user.password_hash) : false;
  if (!user || !valid) {
    const failure = await recordFailure(key, MAX_FAILURES, WINDOW_SECONDS, LOCK_SECONDS);
    return NextResponse.json(
      {
        error: failure.locked
          ? "Вход временно заблокирован на 30 минут."
          : `Неверный email или пароль. Осталось попыток: ${failure.left}.`,
        left: failure.left,
      },
      { status: failure.locked ? 429 : 401 }
    );
  }

  if (!user.email_confirmed_at) {
    return NextResponse.json(
      { error: "Почта ещё не подтверждена.", unconfirmed: true },
      { status: 401 }
    );
  }

  await clearFailures(key);
  const response = NextResponse.json({ ok: true, confirmed: true });
  await createSession(user.id, response);
  return response;
}
