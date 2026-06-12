import { describe, it, expect, vi, beforeEach } from "vitest";
import { Prisma } from "@prisma/client";

// --- Prisma mock ----------------------------------------------------------
// A tiny in-memory stand-in for the `WebhookEvent` unique constraint: the
// first write for an eventId succeeds, a replay throws P2002 (just like
// Postgres), which is exactly what the route's dedupe guard relies on.
const seenEventIds = new Set<string>();
const webhookCreateMock = vi.fn(async ({ data }: { data: { eventId: string } }) => {
  if (seenEventIds.has(data.eventId)) {
    throw new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
      code: "P2002",
      clientVersion: "test",
    });
  }
  seenEventIds.add(data.eventId);
});
const organizationUpsertMock = vi.fn<(arg: unknown) => Promise<{ id: string }>>();
const subscriptionUpsertMock = vi.fn<(arg: unknown) => Promise<unknown>>();
organizationUpsertMock.mockResolvedValue({ id: "org-internal-1" });
subscriptionUpsertMock.mockResolvedValue({});

const tx = {
  webhookEvent: { create: webhookCreateMock },
  organization: { upsert: organizationUpsertMock },
  subscription: { upsert: subscriptionUpsertMock },
};

vi.mock("@/lib/db", () => ({
  prisma: {
    // Run the callback against the tx mock; let thrown errors (e.g. P2002)
    // propagate so the route can catch and dedupe them.
    $transaction: (cb: (t: typeof tx) => Promise<unknown>) => cb(tx),
  },
}));

// --- Stripe mock ----------------------------------------------------------
// `constructEvent` returns whatever the current test stages (or throws to
// simulate a bad signature). No real crypto / network.
let nextEvent: unknown = null;
let constructShouldThrow = false;
const constructEventMock = vi.fn(() => {
  if (constructShouldThrow) {
    throw new Error("No signatures found matching the expected signature for payload");
  }
  return nextEvent;
});

vi.mock("@/lib/stripe", () => ({
  getStripe: () => ({ webhooks: { constructEvent: constructEventMock } }),
}));

import { POST } from "../../app/api/webhooks/stripe/route";

function webhookRequest(body: string, signature: string | null): Request {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (signature !== null) {
    headers["stripe-signature"] = signature;
  }
  return new Request("http://localhost:3000/api/webhooks/stripe", {
    method: "POST",
    headers,
    body,
  });
}

function checkoutCompletedEvent(eventId: string) {
  return {
    id: eventId,
    type: "checkout.session.completed",
    data: {
      object: {
        client_reference_id: "org_clerk_abc",
        subscription: "sub_123",
        metadata: { orgId: "org_clerk_abc", tier: "tier2" },
      },
    },
  };
}

describe("POST /api/webhooks/stripe", () => {
  beforeEach(() => {
    seenEventIds.clear();
    webhookCreateMock.mockClear();
    organizationUpsertMock.mockClear();
    subscriptionUpsertMock.mockClear();
    constructEventMock.mockClear();
    constructShouldThrow = false;
    nextEvent = null;
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
  });

  it("rejects a request with no Stripe-Signature header (400, no DB write)", async () => {
    const res = await POST(webhookRequest("{}", null));
    expect(res.status).toBe(400);
    expect(webhookCreateMock).not.toHaveBeenCalled();
  });

  it("rejects an invalid signature (400, no DB write)", async () => {
    constructShouldThrow = true;
    const res = await POST(webhookRequest("{}", "t=1,v1=bad"));
    expect(res.status).toBe(400);
    expect(webhookCreateMock).not.toHaveBeenCalled();
  });

  it("processes checkout.session.completed: records event + upserts Subscription ACTIVE", async () => {
    nextEvent = checkoutCompletedEvent("evt_1");
    const res = await POST(webhookRequest(JSON.stringify(nextEvent), "t=1,v1=good"));

    expect(res.status).toBe(200);
    expect(webhookCreateMock).toHaveBeenCalledTimes(1);
    expect(webhookCreateMock).toHaveBeenCalledWith({ data: { eventId: "evt_1" } });
    expect(subscriptionUpsertMock).toHaveBeenCalledTimes(1);

    const upsertArg = subscriptionUpsertMock.mock.calls[0][0] as {
      where: { id: string };
      create: { orgId: string; tierId: string; status: string };
      update: { status: string };
    };
    expect(upsertArg.where).toEqual({ id: "sub_123" });
    expect(upsertArg.create.orgId).toBe("org-internal-1");
    expect(upsertArg.create.tierId).toBe("tier2");
    expect(upsertArg.create.status).toBe("ACTIVE");
    expect(upsertArg.update.status).toBe("ACTIVE");
  });

  it("is a no-op on a replayed event: returns 200, no second Subscription write", async () => {
    const event = checkoutCompletedEvent("evt_dupe");
    nextEvent = event;
    const body = JSON.stringify(event);

    // First delivery — processed.
    const first = await POST(webhookRequest(body, "t=1,v1=good"));
    expect(first.status).toBe(200);
    expect(subscriptionUpsertMock).toHaveBeenCalledTimes(1);

    // Second delivery of the SAME event id — deduped no-op.
    const second = await POST(webhookRequest(body, "t=1,v1=good"));
    expect(second.status).toBe(200);
    await expect(second.json()).resolves.toMatchObject({ deduped: true });

    // The dedupe guard was hit a second time, but no second side effect ran.
    expect(webhookCreateMock).toHaveBeenCalledTimes(2);
    expect(subscriptionUpsertMock).toHaveBeenCalledTimes(1);
  });
});
