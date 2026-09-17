import { query } from "@/lib/db";

export type RateLimitStatus = { locked: boolean; retryAfter: number; left: number };

export async function rateLimitStatus(key: string, maxFailures: number): Promise<RateLimitStatus> {
  const result = await query<{
    failures: number;
    locked_until: string | null;
  }>("select failures, locked_until from auth_rate_limits where key = $1", [key]);
  const row = result.rows[0];
  const lockedUntil = row?.locked_until ? new Date(row.locked_until).getTime() : 0;
  return {
    locked: lockedUntil > Date.now(),
    retryAfter: Math.max(0, Math.ceil((lockedUntil - Date.now()) / 1000)),
    left: Math.max(0, maxFailures - Number(row?.failures || 0)),
  };
}

export async function recordFailure(
  key: string,
  maxFailures: number,
  windowSeconds: number,
  lockSeconds: number
) {
  const result = await query<{ failures: number; locked_until: string | null }>(
    `insert into auth_rate_limits (key, failures, window_started_at, locked_until, updated_at)
     values ($1, 1, now(), null, now())
     on conflict (key) do update set
       failures = case
         when auth_rate_limits.window_started_at < now() - make_interval(secs => $2)
           then 1
         else auth_rate_limits.failures + 1
       end,
       window_started_at = case
         when auth_rate_limits.window_started_at < now() - make_interval(secs => $2)
           then now()
         else auth_rate_limits.window_started_at
       end,
       locked_until = case
         when (case
           when auth_rate_limits.window_started_at < now() - make_interval(secs => $2)
             then 1
           else auth_rate_limits.failures + 1
         end) >= $3 then now() + make_interval(secs => $4)
         else auth_rate_limits.locked_until
       end,
       updated_at = now()
     returning failures, locked_until`,
    [key, windowSeconds, maxFailures, lockSeconds]
  );
  const row = result.rows[0];
  const lockedUntil = row?.locked_until ? new Date(row.locked_until).getTime() : 0;
  return {
    locked: lockedUntil > Date.now(),
    retryAfter: Math.max(0, Math.ceil((lockedUntil - Date.now()) / 1000)),
    left: Math.max(0, maxFailures - Number(row?.failures || 0)),
  };
}

export async function clearFailures(key: string) {
  await query("delete from auth_rate_limits where key = $1", [key]);
}

