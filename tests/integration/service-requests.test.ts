/**
 * Integration tests for POST /api/service-requests (T103).
 *
 * Auth, quota, the DB, and ENS are mocked; the real on-curve recipient
 * validation (lib/solana/validate-address) is exercised. The happy path uses an
 * EVM (0x) recipient, which the route accepts without Solana validation.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const { requireAuth, checkAndDecrementQuota, create, getAgentENSName, resolveENS } =
  vi.hoisted(() => ({
    requireAuth: vi.fn(),
    checkAndDecrementQuota: vi.fn(),
    create: vi.fn(),
    getAgentENSName: vi.fn(),
    resolveENS: vi.fn(),
  }));

vi.mock("@/lib/auth", () => {
  class UnauthorizedError extends Error {}
  return { requireAuth, UnauthorizedError };
});
vi.mock("@/lib/quota", () => {
  class QuotaExceededError extends Error {}
  class NoActiveSubscriptionError extends Error {}
  return { checkAndDecrementQuota, QuotaExceededError, NoActiveSubscriptionError };
});
vi.mock("@/lib/db", () => ({ prisma: { serviceRequest: { create } } }));
vi.mock("@/lib/ens/ENSResolver", () => ({ getAgentENSName, resolveENS }));

import { POST } from "@/app/api/service-requests/route";
import { UnauthorizedError } from "@/lib/auth";

function post(body: unknown) {
  return new Request("http://localhost/api/service-requests", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

const VALID_BODY = {
  caseCaption: "Acme Corp v. Doe, No. 24-CV-001",
  plaintiffName: "Acme Corp",
  defendantName: "Jane Doe",
  recipientWallet: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
  attested: true,
};

beforeEach(() => {
  vi.clearAllMocks();
  requireAuth.mockResolvedValue({ userId: "user_1", orgId: "org_1" });
  checkAndDecrementQuota.mockResolvedValue(undefined);
  getAgentENSName.mockResolvedValue(null);
  create.mockResolvedValue({ id: "svc_1", status: "STAGED" });
});

describe("POST /api/service-requests", () => {
  it("returns 401 when unauthenticated", async () => {
    requireAuth.mockRejectedValue(new UnauthorizedError("no session"));
    const res = await POST(post(VALID_BODY));
    expect(res.status).toBe(401);
  });

  it("returns 201 and a staged request for a valid EVM recipient", async () => {
    const res = await POST(post(VALID_BODY));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.status).toBe("STAGED");
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("returns 400 when required fields fail validation (no attestation)", async () => {
    const { attested: _attested, ...rest } = VALID_BODY;
    const res = await POST(post(rest));
    expect(res.status).toBe(400);
    expect(checkAndDecrementQuota).not.toHaveBeenCalled();
  });

  it("returns 400 for an invalid (non-EVM, non-on-curve) recipient", async () => {
    const res = await POST(post({ ...VALID_BODY, recipientWallet: "notawallet" }));
    expect(res.status).toBe(400);
    expect(create).not.toHaveBeenCalled();
  });
});
