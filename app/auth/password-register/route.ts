import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// не больше 3 регистраций в час с одного IP
const MAX_REG = 3;
const WINDOW_SEC = 3600;
const LOCK_SEC = 3600;

function clientIp(req: NextRequest) {
  const fwd = req.headers.get("x-forwarded-for");
  return (fwd ? fwd.split(",")[0] : "").trim() || "unknown";
}

export async function POST(req: NextRequest) {
  let body: {
    email?: string; password?: string;
    full_name?: string; company?: string; phone?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }
  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");
  if (!email || password.length < 8) {
    return NextResponse.json({ error: "Email и пароль (мин. 8 символов) обязательны" }, { status: 400 });
  }

  const ip = clientIp(req);
  const supabase = createClient();

  // ВРЕМЕННО ОТКЛЮЧЕНО: лимит регистраций не применяется
  const ENFORCE_REG_LIMIT = false;
  const { data: hit } = ENFORCE_REG_LIMIT
    ? await supabase.rpc("rate_fail", {
        p_key: `reg:${ip}`, p_max: MAX_REG + 1, p_window_sec: WINDOW_SEC, p_lock_sec: LOCK_SEC,
      })
    : { data: null };
  if (ENFORCE_REG_LIMIT && hit?.locked) {
    return NextResponse.json(
      { error: "Слишком много регистраций с этого адреса. Попробуйте через час." },
      { status: 429 }
    );
  }

  const origin = req.nextUrl.origin;
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${origin}/auth/callback`,
      data: {
        full_name: String(body.full_name || "").trim(),
        company: String(body.company || "").trim(),
        phone: String(body.phone || "").trim(),
        role: "client",
      },
    },
  });

  if (error) {
    const exists = /already registered/i.test(error.message);
    return NextResponse.json(
      { error: exists ? "Этот email уже зарегистрирован. Попробуйте войти." : error.message },
      { status: 400 }
    );
  }
  return NextResponse.json({ ok: true });
}
