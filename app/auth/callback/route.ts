import { NextResponse, type NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const url = new URL("/login", request.url);
  url.searchParams.set("auth_error", "verification_unavailable");
  return NextResponse.redirect(url);
}
