/**
 * Unit tests for lib/payments/DynamicFlow.ts (T102).
 *
 * `fetch` is stubbed via `vi.stubGlobal` so no HTTP request leaves the suite.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFlowSession, parseFlowWebhook } from "@/lib/payments/DynamicFlow";

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  process.env.NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID = "env-123";
  process.env.DYNAMIC_BEARER_TOKEN = "real-token";
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID;
  delete process.env.DYNAMIC_BEARER_TOKEN;
});

describe("createFlowSession", () => {
  it("returns null when DYNAMIC_BEARER_TOKEN is unset", async () => {
    delete process.env.DYNAMIC_BEARER_TOKEN;

    const res = await createFlowSession({
      deliveryId: "del-1",
      amountCents: 20000,
      email: "filer@test.eps",
    });

    expect(res).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns null when the bearer token is the PLACEHOLDER sentinel", async () => {
    process.env.DYNAMIC_BEARER_TOKEN = "PLACEHOLDER";

    expect(
      await createFlowSession({ deliveryId: "d", amountCents: 100, email: "a@b.c" }),
    ).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("posts to the Flow API and maps the session response", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ id: "sess_9", url: "https://app.dynamic.xyz/pay/sess_9" }),
    });

    const res = await createFlowSession({
      deliveryId: "del-7",
      amountCents: 60000,
      email: "filer@test.eps",
    });

    expect(res).toEqual({
      sessionId: "sess_9",
      paymentUrl: "https://app.dynamic.xyz/pay/sess_9",
      amountCents: 60000,
      deliveryId: "del-7",
    });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain("/environments/env-123/flow/sessions");
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe("Bearer real-token");
    expect(JSON.parse(init.body)).toMatchObject({ amount: 600, currency: "USD" });
  });

  it("returns null when the Flow API responds non-ok", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 502,
      text: async () => "bad gateway",
    });

    expect(
      await createFlowSession({ deliveryId: "d", amountCents: 100, email: "a@b.c" }),
    ).toBeNull();
  });

  it("returns null (no throw) when fetch rejects", async () => {
    fetchMock.mockRejectedValue(new Error("network down"));

    await expect(
      createFlowSession({ deliveryId: "d", amountCents: 100, email: "a@b.c" }),
    ).resolves.toBeNull();
  });
});

describe("parseFlowWebhook", () => {
  it("extracts amount, currency and payer from the webhook body", () => {
    const body = JSON.stringify({
      sessionId: "sess_9",
      status: "completed",
      amount: 600,
      currency: "USD",
      payer: "0xpayer",
    });

    const parsed = parseFlowWebhook(body);

    expect(parsed).not.toBeNull();
    expect(parsed!.amount).toBe(600);
    expect(parsed!.currency).toBe("USD");
    expect(parsed!.payer).toBe("0xpayer");
    expect(parsed!.status).toBe("completed");
  });

  it("returns null for a malformed body", () => {
    expect(parseFlowWebhook("not json{")).toBeNull();
  });
});
