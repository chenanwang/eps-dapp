import { describe, it, expect, vi, beforeEach } from "vitest";
import { UnauthorizedError } from "../lib/auth";

// Mock the auth + stripe collaborators so the route can be exercised in
// isolation (no live Clerk session, no live Stripe call).
const requireAuthMock = vi.fn();
vi.mock("@/lib/auth", async () => {
  const actual = await vi.importActual<typeof import("../lib/auth")>("../lib/auth");
  return { ...actual, requireAuth: () => requireAuthMock() };
});

const createSessionMock = vi.fn();
vi.mock("@/lib/stripe", async () => {
  const actual = await vi.importActual<typeof import("../lib/stripe")>("../lib/stripe");
  return {
    ...actual,
    getStripe: () => ({ checkout: { sessions: { create: createSessionMock } } }),
    priceIdForTier: (tier: string) => `price_${tier}`,
  };
});

import { POST } from "../app/api/checkout/route";

function postRequest(body: unknown, init?: { raw?: string }): Request {
  return new Request("http://localhost:3000/api/checkout", {
    method: "POST",
    headers: { "Content-Type": "application/json", origin: "http://localhost:3000" },
    body: init?.raw ?? JSON.stringify(body),
  });
}

describe("POST /api/checkout", () => {
  beforeEach(() => {
    requireAuthMock.mockReset();
    createSessionMock.mockReset();
    requireAuthMock.mockResolvedValue({ userId: "user_123", orgId: "org_456" });
    createSessionMock.mockResolvedValue({ url: "https://checkout.stripe.test/session_abc" });
  });

  it("returns 401 when the request is unauthenticated", async () => {
    requireAuthMock.mockRejectedValue(new UnauthorizedError());
    const res = await POST(postRequest({ tier: "tier1" }));
    expect(res.status).toBe(401);
    expect(createSessionMock).not.toHaveBeenCalled();
  });

  it("returns 400 for an invalid tier", async () => {
    const res = await POST(postRequest({ tier: "tier9" }));
    expect(res.status).toBe(400);
    expect(createSessionMock).not.toHaveBeenCalled();
  });

  it("returns 400 for a malformed JSON body", async () => {
    const res = await POST(postRequest(null, { raw: "{not json" }));
    expect(res.status).toBe(400);
    expect(createSessionMock).not.toHaveBeenCalled();
  });

  it("creates a subscription-mode session with promo codes enabled and returns the URL", async () => {
    const res = await POST(postRequest({ tier: "tier2" }));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      url: "https://checkout.stripe.test/session_abc",
    });

    expect(createSessionMock).toHaveBeenCalledTimes(1);
    const params = createSessionMock.mock.calls[0][0];
    expect(params.mode).toBe("subscription");
    expect(params.allow_promotion_codes).toBe(true);
    expect(params.line_items).toEqual([{ price: "price_tier2", quantity: 1 }]);
    // Org/user come from the verified token, not the request body.
    expect(params.client_reference_id).toBe("org_456");
    expect(params.metadata).toEqual({ orgId: "org_456", userId: "user_123", tier: "tier2" });
    expect(params.success_url).toContain("/dashboard?checkout=success");
    expect(params.cancel_url).toContain("/pricing?checkout=cancelled");
  });
});
