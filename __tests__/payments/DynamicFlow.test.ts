/**
 * Unit tests for lib/payments/DynamicFlow.ts (T102).
 * `fetch` is mocked so no Dynamic API calls are made.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createFlowSession, parseFlowWebhook } from "@/lib/payments/DynamicFlow";

const ENV_KEYS = ["NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID", "DYNAMIC_BEARER_TOKEN"] as const;
let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = {};
  for (const k of ENV_KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
  vi.restoreAllMocks();
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe("createFlowSession", () => {
  const params = { deliveryId: "del_1", amountCents: 20000, email: "f@test.eps" };

  it("returns null when DYNAMIC_BEARER_TOKEN is unset", async () => {
    process.env.NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID = "env_123";
    expect(await createFlowSession(params)).toBeNull();
  });

  it("returns null when the bearer token is the PLACEHOLDER sentinel", async () => {
    process.env.NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID = "env_123";
    process.env.DYNAMIC_BEARER_TOKEN = "PLACEHOLDER";
    expect(await createFlowSession(params)).toBeNull();
  });

  it("returns a session from the API response when configured", async () => {
    process.env.NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID = "env_123";
    process.env.DYNAMIC_BEARER_TOKEN = "real-token";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ id: "sess_abc", url: "https://app.dynamic.xyz/pay/sess_abc" }),
      })),
    );
    const res = await createFlowSession(params);
    expect(res?.sessionId).toBe("sess_abc");
    expect(res?.paymentUrl).toBe("https://app.dynamic.xyz/pay/sess_abc");
    expect(res?.amountCents).toBe(20000);
  });

  it("returns null when the API responds with an error", async () => {
    process.env.NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID = "env_123";
    process.env.DYNAMIC_BEARER_TOKEN = "real-token";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 401, text: async () => "unauthorized" })),
    );
    expect(await createFlowSession(params)).toBeNull();
  });
});

describe("parseFlowWebhook", () => {
  it("parses a valid webhook body", () => {
    const body = JSON.stringify({ sessionId: "sess_abc", status: "completed", amount: 200 });
    const parsed = parseFlowWebhook(body);
    expect(parsed?.sessionId).toBe("sess_abc");
    expect(parsed?.status).toBe("completed");
  });

  it("returns null for malformed JSON", () => {
    expect(parseFlowWebhook("{not json")).toBeNull();
  });
});
