import { NextResponse } from "next/server";
import { currentSessionUser } from "@/lib/auth/session";

export async function GET() {
  const user = await currentSessionUser();
  return NextResponse.json({ authenticated: Boolean(user) });
}

