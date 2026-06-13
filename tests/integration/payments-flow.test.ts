/**
 * Integration tests for POST /api/payments/flow-session (T103).
 * Clerk `auth` is mocked; Dynamic Flow is left unconfigured so the route takes
 * its 503 ("not configured") path rather than calling the real Dynamic API.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { auth } = vi.hoisted(() => ({ auth: vi.fn() }));
vi.mock("@clerk/nextjs/server", () => ({ auth }));

import { POST } from "@/app/api/payments/flow-session/route";
import { NextRequest } from "next/server";

function post(body: unknown) {
  return new NextRequest("http://localhost/api/payments/flow-session", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

const ENV_KEYS = ["NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID", "DYNAMIC_BEARER_TOKEN"] as const;
let saved: Record<string, string | undefined>;

beforeEach(() => {
  vi.clearAllMocks();
  saved = {};
  for (const k of ENV_KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
});
afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe("POST /api/payments/flow-session", () => {
  it("returns 401 when unauthenticated", async () => {
    auth.mockResolvedValue({ userId: null });
    const res = await POST(post({ deliveryId: "d1", amountCents: 20000, email: "f@test.eps" }));
    expect(res.status).toBe(401);
  });

  it("returns 400 when required fields are missing", async () => {
    auth.mockResolvedValue({ userId: "user_1" });
    const res = await POST(post({ deliveryId: "d1" }));
    expect(res.status).toBe(400);
  });

  it("returns 503 (not 500) when Dynamic Flow is unconfigured", async () => {
    auth.mockResolvedValue({ userId: "user_1" });
    const res = await POST(post({ deliveryId: "d1", amountCents: 20000, email: "f@test.eps" }));
    expect(res.status).toBe(503);
  });
});
