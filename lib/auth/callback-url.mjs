const SAFE_DEFAULT_PATH = "/confirmed";

/**
 * Accept only a path on the current EXIM origin. Auth callbacks must never be
 * usable as open redirects, even when `next` comes from a query string.
 */
export function safeInternalPath(value, fallback = SAFE_DEFAULT_PATH) {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) {
    return fallback;
  }

  try {
    const parsed = new URL(value, "https://exim.invalid");
    if (parsed.origin !== "https://exim.invalid") return fallback;
    if (parsed.pathname === "/auth/callback") return fallback;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return fallback;
  }
}

export function callbackFailureUrl(origin, reason) {
  const url = new URL("/login", origin);
  url.searchParams.set("auth_error", reason);
  return url;
}

const APP_HASH = /^#\/[A-Za-z0-9-]{1,41}(\/[A-Za-z0-9-]{1,64})?$/;

/**
 * Where to send a user after login (AC-TASK-009). Only the application itself (/app) is an
 * allowed target; the in-app address (hash) is kept only if it has the router's shape.
 * The router then opens the object only if the server returns it to this user.
 */
export function safeReturnTarget(next, hash) {
  const path = safeInternalPath(typeof next === "string" ? next : "", "/app");
  const base = path === "/app" || path.startsWith("/app?") ? path.split("#")[0] : "/app";
  const h = typeof hash === "string" && APP_HASH.test(hash) ? hash : "";
  return base + h;
}
