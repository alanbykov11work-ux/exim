import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  callbackFailureUrl,
  safeInternalPath,
} from "@/lib/auth/callback-url.mjs";

const RECOVERY_COOKIE = "exim-recovery-context";

function successfulRedirect(origin: string, path: string, recovery: boolean) {
  const response = NextResponse.redirect(new URL(path, origin));
  if (recovery) {
    response.cookies.set(RECOVERY_COOKIE, "active", {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 15 * 60,
    });
  }
  return response;
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type");
  const providerError = searchParams.get("error");
  const next = safeInternalPath(searchParams.get("next"));

  if (providerError) {
    return NextResponse.redirect(callbackFailureUrl(origin, "provider_rejected"));
  }

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      return NextResponse.redirect(callbackFailureUrl(origin, "invalid_or_expired"));
    }

    const recovery = next === "/reset-password";
    return successfulRedirect(origin, recovery ? "/reset-password" : next, recovery);
  }

  if (tokenHash && type) {
    if (!(["signup", "recovery", "email"] as const).includes(type as "signup" | "recovery" | "email")) {
      return NextResponse.redirect(callbackFailureUrl(origin, "unsupported_type"));
    }

    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({
      type: type as "signup" | "recovery" | "email",
      token_hash: tokenHash,
    });
    if (error) {
      return NextResponse.redirect(callbackFailureUrl(origin, "invalid_or_expired"));
    }

    const recovery = type === "recovery";
    return successfulRedirect(origin, recovery ? "/reset-password" : next, recovery);
  }

  return NextResponse.redirect(callbackFailureUrl(origin, "missing_credentials"));
}
