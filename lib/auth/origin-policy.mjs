function normalizedOrigin(value) {
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

/**
 * Compare browser Origin against both the URL observed by Next.js and the
 * canonical public URL configured for a reverse-proxied deployment.
 * Forwarded host headers are intentionally not trusted here.
 */
export function isAllowedRequestOrigin(origin, requestOrigin, appBaseUrl) {
  if (!origin) return true;

  const browserOrigin = normalizedOrigin(origin);
  if (!browserOrigin || browserOrigin !== origin) return false;

  const allowed = new Set([
    normalizedOrigin(requestOrigin),
    normalizedOrigin(appBaseUrl),
  ]);
  allowed.delete(null);
  return allowed.has(browserOrigin);
}
