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
