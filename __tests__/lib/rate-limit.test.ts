import { afterEach, describe, expect, it } from "vitest";
import {
  rateLimit,
  clientKey,
  rateLimitHeaders,
  __resetRateLimitStore,
} from "@/lib/rate-limit";

afterEach(() => __resetRateLimitStore());

describe("rateLimit", () => {
  const opts = { limit: 3, windowMs: 60_000 };

  it("allows requests up to the limit then blocks", () => {
    const t0 = 1_000_000;
    expect(rateLimit("k", opts, t0).ok).toBe(true);
    expect(rateLimit("k", opts, t0).ok).toBe(true);
    expect(rateLimit("k", opts, t0).ok).toBe(true);
    const blocked = rateLimit("k", opts, t0);
    expect(blocked.ok).toBe(false);
    expect(blocked.remaining).toBe(0);
  });

  it("reports remaining count correctly", () => {
    const t0 = 2_000_000;
    expect(rateLimit("r", opts, t0).remaining).toBe(2);
    expect(rateLimit("r", opts, t0).remaining).toBe(1);
    expect(rateLimit("r", opts, t0).remaining).toBe(0);
  });

  it("resets after the window elapses", () => {
    const t0 = 3_000_000;
    rateLimit("w", opts, t0);
    rateLimit("w", opts, t0);
    rateLimit("w", opts, t0);
    expect(rateLimit("w", opts, t0).ok).toBe(false);
    // One ms past the window — fresh budget.
    const after = rateLimit("w", opts, t0 + opts.windowMs + 1);
    expect(after.ok).toBe(true);
    expect(after.remaining).toBe(2);
  });

  it("keeps separate keys independent", () => {
    const t0 = 4_000_000;
    rateLimit("a", opts, t0);
    rateLimit("a", opts, t0);
    rateLimit("a", opts, t0);
    expect(rateLimit("a", opts, t0).ok).toBe(false);
    expect(rateLimit("b", opts, t0).ok).toBe(true);
  });
});

describe("clientKey", () => {
  it("prefers the left-most x-forwarded-for address", () => {
    const req = new Request("https://x.test", {
      headers: { "x-forwarded-for": "1.2.3.4, 5.6.7.8" },
    });
    expect(clientKey(req)).toBe("1.2.3.4");
  });

  it("falls back to x-real-ip then 'unknown'", () => {
    const withReal = new Request("https://x.test", { headers: { "x-real-ip": "9.9.9.9" } });
    expect(clientKey(withReal)).toBe("9.9.9.9");
    expect(clientKey(new Request("https://x.test"))).toBe("unknown");
  });
});

describe("rateLimitHeaders", () => {
  it("includes Retry-After only when blocked", () => {
    const ok = rateLimitHeaders({ ok: true, limit: 3, remaining: 2, resetAt: 0, retryAfterSeconds: 60 });
    expect(ok["Retry-After"]).toBeUndefined();
    expect(ok["RateLimit-Limit"]).toBe("3");

    const blocked = rateLimitHeaders({ ok: false, limit: 3, remaining: 0, resetAt: 0, retryAfterSeconds: 42 });
    expect(blocked["Retry-After"]).toBe("42");
  });
});
