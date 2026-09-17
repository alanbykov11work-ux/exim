import { NextResponse } from "next/server";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await query("select 1");
    return NextResponse.json({ ok: true, service: "exim-super-app", database: "ok" });
  } catch {
    return NextResponse.json(
      { ok: false, service: "exim-super-app", database: "unavailable" },
      { status: 503 }
    );
  }
}

