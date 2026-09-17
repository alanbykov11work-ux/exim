import type { NextRequest } from "next/server";
import { isAllowedRequestOrigin } from "@/lib/auth/origin-policy.mjs";

export function requestIp(request: NextRequest) {
  const forwarded = request.headers.get("x-forwarded-for");
  return (forwarded?.split(",")[0] || "unknown").trim();
}

export function sameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  return isAllowedRequestOrigin(
    origin,
    request.nextUrl.origin,
    process.env.APP_BASE_URL
  );
}
