import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// ВРЕМЕННО ОТКЛЮЧЕНО по решению владельца: блокировки не применяются,
// счётчик попыток не ведётся. Вернуть: ENFORCE_LOCK = true.
const ENFORCE_LOCK = false;
const MAX_FAILS = 5;
const WINDOW_SEC = 30 * 60;
const LOCK_SEC = 30 * 60;

function clientIp(req: NextRequest) {
  const fwd = req.headers.get("x-forwarded-for");
  return (fwd ? fwd.split(",")[0] : "").trim() || "unknown";
}

export async function POST(req: NextRequest) {
  let email = "";
  let password = "";
  try {
    const body = await req.json();
    email = String(body.email || "").trim().toLowerCase();
    password = String(body.password || "");
  } catch {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }
  if (!email || !password) {
    return NextResponse.json({ error: "Укажите email и пароль" }, { status: 400 });
  }

  const ip = clientIp(req);
  const key = `login:${email}:${ip}`;
  const supabase = createClient();

  // 1) проверка блокировки ДО попытки входа
  const { data: status } = ENFORCE_LOCK
    ? await supabase.rpc("rate_status", { p_key: key })
    : { data: null };
  if (ENFORCE_LOCK && status?.locked) {
    const min = Math.ceil((status.retry_after || LOCK_SEC) / 60);
    return NextResponse.json(
      { error: `Слишком много неудачных попыток. Попробуйте через ${min} мин.`, locked: true, retry_after: status.retry_after },
      { status: 429 }
    );
  }

  // 2) попытка входа
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    // 3) неудача — фиксируем попытку (только если защита включена)
    const { data: fail } = ENFORCE_LOCK
      ? await supabase.rpc("rate_fail", {
          p_key: key, p_max: MAX_FAILS, p_window_sec: WINDOW_SEC, p_lock_sec: LOCK_SEC,
        })
      : { data: null };
    if (ENFORCE_LOCK && fail?.locked) {
      return NextResponse.json(
        { error: "5 неудачных попыток — вход заблокирован на 30 минут.", locked: true, retry_after: fail.retry_after },
        { status: 429 }
      );
    }
    const left = fail?.left ?? null;
    const isCreds = /invalid login/i.test(error.message);
    const isUnconfirmed = /not confirmed/i.test(error.message);
    return NextResponse.json(
      {
        error: isUnconfirmed
          ? "Почта ещё не подтверждена. Проверьте входящие."
          : isCreds
            ? `Неверный email или пароль.${left != null ? ` Осталось попыток: ${left}.` : ""}`
            : error.message,
        left,
        unconfirmed: isUnconfirmed,
      },
      { status: 401 }
    );
  }

  // 4) успех — сбрасываем счётчик (уже авторизованы, функция проверит право)
  try { await supabase.rpc("rate_clear", { p_key: key }); } catch {}

  return NextResponse.json({
    ok: true,
    confirmed: !!data.user?.email_confirmed_at,
  });
}
