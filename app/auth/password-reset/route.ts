import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json({ error: "Сброс пароля будет доступен после подключения почтового сервиса." }, { status: 503 });
}
