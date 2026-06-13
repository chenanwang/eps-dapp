import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  rateLimit,
  clientIpFromHeaders,
  __resetRateLimit,
} from "@/lib/rateLimit";

// --- The in-memory fixed-window limiter (T-503 / T-401) ----------------------
describe("rateLimit (in-memory fixed-window)", () => {
  beforeEach(() => __resetRateLimit());

  it("allows requests up to the limit then blocks", () => {
    const opts = { limit: 10, windowMs: 60_000 };
    for (let i = 1; i <= 10; i++) {
      const r = rateLimit("1.2.3.4", opts);
      expect(r.ok).toBe(true);
      expect(r.remaining).toBe(10 - i);
    }
    // 11th request in the same window is rejected.
    const over = rateLimit("1.2.3.4", opts);
    expect(over.ok).toBe(false);
    expect(over.remaining).toBe(0);
  });

  it("buckets each IP independently", () => {
    const opts = { limit: 1, windowMs: 60_000 };
    expect(rateLimit("a", opts).ok).toBe(true);
    expect(rateLimit("a", opts).ok).toBe(false);
    // A different key starts with a fresh window.
    expect(rateLimit("b", opts).ok).toBe(true);
  });

  it("resets once the window elapses", () => {
    const opts = { limit: 1, windowMs: 60_000 };
    expect(rateLimit("k", opts, 0).ok).toBe(true);
    expect(rateLimit("k", opts, 100).ok).toBe(false); // same window
    expect(rateLimit("k", opts, 60_000).ok).toBe(true); // window elapsed
  });
});

describe("clientIpFromHeaders", () => {
  it("uses the first x-forwarded-for hop, then x-real-ip, then 'unknown'", () => {
    expect(
      clientIpFromHeaders(new Headers({ "x-forwarded-for": "9.9.9.9, 10.0.0.1" })),
    ).toBe("9.9.9.9");
    expect(clientIpFromHeaders(new Headers({ "x-real-ip": "8.8.8.8" }))).toBe(
      "8.8.8.8",
    );
    expect(clientIpFromHeaders(new Headers())).toBe("unknown");
  });
});

// --- The certificate route returns 429 once the limit is exceeded ------------
const requireAuthMock = vi.fn();
vi.mock("@/lib/auth", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth")>("@/lib/auth");
  return { ...actual, requireAuth: () => requireAuthMock() };
});

const getOrCreateMock = vi.fn();
vi.mock("@/lib/certificate-store", () => ({
  getOrCreateCertificatePdf: (id: string) => getOrCreateMock(id),
}));

import { GET } from "@/app/api/certificate/[noticeId]/route";

describe("GET /api/certificate/:noticeId rate limiting", () => {
  beforeEach(() => {
    __resetRateLimit();
    requireAuthMock.mockReset();
    getOrCreateMock.mockReset();
    requireAuthMock.mockResolvedValue({ userId: "u1", orgId: "o1" });
    getOrCreateMock.mockResolvedValue(new Uint8Array([0x25, 0x50, 0x44, 0x46]));
  });

  function call(ip: string) {
    return GET(
      new Request("http://localhost/api/certificate/n1", {
        headers: { "x-forwarded-for": ip },
      }),
      { params: Promise.resolve({ noticeId: "n1" }) },
    );
  }

  it("returns 429 with Retry-After once the per-IP limit is exceeded", async () => {
    // 10 allowed requests from the same IP.
    for (let i = 0; i < 10; i++) {
      const res = await call("203.0.113.7");
      expect(res.status).toBe(200);
    }
    // The 11th is throttled before auth/generation.
    const res = await call("203.0.113.7");
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).not.toBeNull();
    await expect(res.json()).resolves.toEqual({ error: "Too many requests" });
  });

  it("does not throttle a different IP", async () => {
    for (let i = 0; i < 10; i++) await call("203.0.113.7");
    const other = await call("198.51.100.2");
    expect(other.status).toBe(200);
  });
});
