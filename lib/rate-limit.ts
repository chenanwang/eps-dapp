/**
 * In-process fixed-window rate limiter (T107 production hardening).
 *
 * Deliberately dependency-free and in-memory: the EPS app runs as a small
 * number of serverless/long-lived instances and the limits here are abuse
 * dampeners (protecting upstream RPC/ENS quotas and the intake path), not a
 * distributed quota. A per-instance counter is sufficient for that goal and
 * adds no new infrastructure (CLAUDE.md: "prefer boring solutions; no new
 * dependencies without an ADR"). For a strict cross-instance limit, swap the
 * `Map` for a shared store (Redis/Postgres) behind the same interface — but
 * that needs an ADR.
 *
 * Each caller key gets a window of `windowMs`. The first request in a window
 * starts the clock; the (limit+1)-th request inside the same window is denied
 * until the window rolls over.
 */

interface Counter {
  /** Requests seen in the current window. */
  count: number;
  /** Epoch ms at which the current window expires and the count resets. */
  resetAt: number;
}

const buckets = new Map<string, Counter>();

export interface RateLimitResult {
  /** Whether this request is allowed. */
  ok: boolean;
  /** Configured ceiling for the window. */
  limit: number;
  /** Requests remaining in the current window (0 when blocked). */
  remaining: number;
  /** Epoch ms when the window resets. */
  resetAt: number;
  /** Seconds until reset — convenient for a `Retry-After` header. */
  retryAfterSeconds: number;
}

export interface RateLimitOptions {
  /** Max requests allowed per window. */
  limit: number;
  /** Window length in milliseconds. */
  windowMs: number;
}

/**
 * Record a hit for `key` and report whether it is within the limit.
 *
 * `key` should be a stable identifier for the caller — typically
 * `"<route>:<ip>"` so each route has an independent budget per client.
 */
export function rateLimit(key: string, opts: RateLimitOptions, now: number = Date.now()): RateLimitResult {
  const { limit, windowMs } = opts;
  const existing = buckets.get(key);

  if (!existing || now >= existing.resetAt) {
    // Start a fresh window.
    const resetAt = now + windowMs;
    buckets.set(key, { count: 1, resetAt });
    return { ok: true, limit, remaining: limit - 1, resetAt, retryAfterSeconds: Math.ceil(windowMs / 1000) };
  }

  existing.count += 1;
  const remaining = Math.max(0, limit - existing.count);
  const ok = existing.count <= limit;
  return {
    ok,
    limit,
    remaining,
    resetAt: existing.resetAt,
    retryAfterSeconds: Math.max(0, Math.ceil((existing.resetAt - now) / 1000)),
  };
}

/**
 * Best-effort client identifier from a request. Prefers the left-most address
 * in `x-forwarded-for` (the original client through Vercel's proxy), then
 * `x-real-ip`, then a fixed fallback so a missing header degrades to a single
 * shared bucket rather than throwing.
 */
export function clientKey(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) {
    const first = fwd.split(",")[0]?.trim();
    if (first) return first;
  }
  return req.headers.get("x-real-ip")?.trim() || "unknown";
}

/** Standard rate-limit headers for a response (RateLimit + Retry-After). */
export function rateLimitHeaders(result: RateLimitResult): Record<string, string> {
  const headers: Record<string, string> = {
    "RateLimit-Limit": String(result.limit),
    "RateLimit-Remaining": String(result.remaining),
    "RateLimit-Reset": String(result.retryAfterSeconds),
  };
  if (!result.ok) headers["Retry-After"] = String(result.retryAfterSeconds);
  return headers;
}

/** Test-only: clear all counters between cases. */
export function __resetRateLimitStore(): void {
  buckets.clear();
}
