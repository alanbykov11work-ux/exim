import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type");
  const next = searchParams.get("next") ?? "/app";

  const supabase = createClient();

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}${next}`);
  }

  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({
      type: type as "signup" | "recovery" | "email",
      token_hash: tokenHash,
    });
    if (!error) {
      return NextResponse.redirect(
        `${origin}${type === "recovery" ? "/reset-password" : next}`
      );
    }
  }

  // Сюда попадают после клика по письму из другого браузера/устройства:
  // подтверждение на сервере Supabase уже произошло, но сессию здесь не
  // создать (нет PKCE-verifier). Отправляем на вход с понятным сообщением.
  return NextResponse.redirect(`${origin}/login?verified=1`);
}
