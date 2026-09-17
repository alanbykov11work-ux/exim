import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

const RECOVERY_COOKIE = "exim-recovery-context";

export async function POST(request: NextRequest) {
  if (request.headers.get("origin") !== request.nextUrl.origin) {
    return NextResponse.json({ error: "Недопустимый источник запроса." }, { status: 403 });
  }

  if (request.cookies.get(RECOVERY_COOKIE)?.value !== "active") {
    return NextResponse.json(
      { error: "Ссылка восстановления недействительна или устарела. Запросите новую." },
      { status: 403 }
    );
  }

  let password = "";
  try {
    const body = await request.json();
    password = String(body.password || "");
  } catch {
    return NextResponse.json({ error: "Некорректный запрос." }, { status: 400 });
  }

  if (password.length < 8) {
    return NextResponse.json(
      { error: "Пароль должен быть не короче 8 символов." },
      { status: 400 }
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { error: "Сессия восстановления истекла. Запросите новую ссылку." },
      { status: 401 }
    );
  }

  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    return NextResponse.json({ error: "Не удалось сохранить пароль." }, { status: 400 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(RECOVERY_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
  return response;
}
