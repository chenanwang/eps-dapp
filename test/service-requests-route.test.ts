import { describe, it, expect, vi, beforeEach } from "vitest";
import { Keypair, PublicKey } from "@solana/web3.js";
import { UnauthorizedError } from "../lib/auth";
import { QuotaExceededError, NoActiveSubscriptionError } from "../lib/quota";

// Mock auth, quota, and db so the route can be exercised without a live Clerk
// session, Stripe-backed subscription, or Postgres. The Solana address
// validator (lib/solana/validate-address) runs for real — it is pure.
const requireUserMock = vi.fn();
vi.mock("@/lib/auth", async () => {
  const actual = await vi.importActual<typeof import("../lib/auth")>("../lib/auth");
  return { ...actual, requireUser: () => requireUserMock() };
});

const checkAndDecrementQuotaMock = vi.fn();
vi.mock("@/lib/quota", async () => {
  const actual = await vi.importActual<typeof import("../lib/quota")>("../lib/quota");
  return { ...actual, checkAndDecrementQuota: (orgId: string) => checkAndDecrementQuotaMock(orgId) };
});

const createMock = vi.fn();
vi.mock("@/lib/db", () => ({
  prisma: { serviceRequest: { create: (args: unknown) => createMock(args) } },
}));

import { POST } from "../app/api/service-requests/route";

// A real on-curve wallet address (valid recipient).
const VALID_WALLET = Keypair.generate().publicKey.toBase58();
// A PDA is off-curve — a valid base58 string but not a serviceable recipient.
const OFF_CURVE_WALLET = PublicKey.findProgramAddressSync(
  [Buffer.from("eps-test")],
  new PublicKey("11111111111111111111111111111111"),
)[0].toBase58();

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    caseCaption: "Smith v. Jones, No. 24-CV-1234",
    plaintiffName: "Smith",
    defendantName: "Jones",
    recipientWallet: VALID_WALLET,
    courtOrderFlag: false,
    attested: true,
    ...overrides,
  };
}

function postRequest(body: unknown, init?: { raw?: string }): Request {
  return new Request("http://localhost:3000/api/service-requests", {
    method: "POST",
    headers: { "Content-Type": "application/json", origin: "http://localhost:3000" },
    body: init?.raw ?? JSON.stringify(body),
  });
}

describe("POST /api/service-requests", () => {
  beforeEach(() => {
    requireUserMock.mockReset();
    checkAndDecrementQuotaMock.mockReset();
    createMock.mockReset();
    requireUserMock.mockResolvedValue({ userId: "user_1", orgId: "org_1" });
    checkAndDecrementQuotaMock.mockResolvedValue({ usageCount: 1, limit: 9 });
    createMock.mockResolvedValue({ id: "svc_1", status: "STAGED" });
  });

  it("stages a STAGED request for valid input and decrements quota", async () => {
    const res = await POST(postRequest(validBody()));
    expect(res.status).toBe(201);
    await expect(res.json()).resolves.toEqual({ id: "svc_1", status: "STAGED" });

    expect(checkAndDecrementQuotaMock).toHaveBeenCalledWith("org_1");
    const createArg = createMock.mock.calls[0][0];
    expect(createArg.data).toMatchObject({
      userId: "user_1",
      caseCaption: "Smith v. Jones, No. 24-CV-1234",
      plaintiffName: "Smith",
      defendantName: "Jones",
      recipientWallet: VALID_WALLET,
      courtOrderFlag: false,
      status: "STAGED",
      organization: { connect: { clerkOrgId: "org_1" } },
    });
    // attestedAt is stamped server-side, never taken from the body.
    expect(createArg.data.attestedAt).toBeInstanceOf(Date);
  });

  it("stages a request for a user with no org, scoped to userId, skipping quota", async () => {
    // Issue #112: a brand-new user with no active organization must be able to
    // file. Quota meters the org's subscription, so with no org there is nothing
    // to meter — the request is owned by `userId` and no org is connected.
    requireUserMock.mockResolvedValue({ userId: "user_1", orgId: null });

    const res = await POST(postRequest(validBody()));
    expect(res.status).toBe(201);
    await expect(res.json()).resolves.toEqual({ id: "svc_1", status: "STAGED" });

    expect(checkAndDecrementQuotaMock).not.toHaveBeenCalled();
    const createArg = createMock.mock.calls[0][0];
    expect(createArg.data).toMatchObject({
      userId: "user_1",
      caseCaption: "Smith v. Jones, No. 24-CV-1234",
      status: "STAGED",
    });
    // No org → no organization connect on the create payload.
    expect(createArg.data.organization).toBeUndefined();
  });

  it("returns 401 when unauthenticated and never touches quota", async () => {
    requireUserMock.mockRejectedValue(new UnauthorizedError());
    const res = await POST(postRequest(validBody()));
    expect(res.status).toBe(401);
    expect(checkAndDecrementQuotaMock).not.toHaveBeenCalled();
    expect(createMock).not.toHaveBeenCalled();
  });

  it("rejects a missing attestation pre-quota (400)", async () => {
    const res = await POST(postRequest(validBody({ attested: false })));
    expect(res.status).toBe(400);
    // Bad input must be rejected BEFORE any quota is consumed (P2 gate).
    expect(checkAndDecrementQuotaMock).not.toHaveBeenCalled();
    expect(createMock).not.toHaveBeenCalled();
  });

  it("rejects a blank required field pre-quota (400)", async () => {
    const res = await POST(postRequest(validBody({ caseCaption: "   " })));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.issues.caseCaption).toBeTruthy();
    expect(checkAndDecrementQuotaMock).not.toHaveBeenCalled();
  });

  it("rejects an off-curve (PDA) recipient pre-quota (400)", async () => {
    const res = await POST(postRequest(validBody({ recipientWallet: OFF_CURVE_WALLET })));
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ reason: "off-curve" });
    expect(checkAndDecrementQuotaMock).not.toHaveBeenCalled();
    expect(createMock).not.toHaveBeenCalled();
  });

  it("rejects a malformed recipient address pre-quota (400)", async () => {
    const res = await POST(postRequest(validBody({ recipientWallet: "not-a-wallet" })));
    expect(res.status).toBe(400);
    expect(checkAndDecrementQuotaMock).not.toHaveBeenCalled();
  });

  it("returns 400 for a malformed JSON body", async () => {
    const res = await POST(postRequest(null, { raw: "{not json" }));
    expect(res.status).toBe(400);
    expect(checkAndDecrementQuotaMock).not.toHaveBeenCalled();
  });

  it("returns 403 when quota is exhausted and never creates a record", async () => {
    checkAndDecrementQuotaMock.mockRejectedValue(new QuotaExceededError("org_1", 1));
    const res = await POST(postRequest(validBody()));
    expect(res.status).toBe(403);
    expect(createMock).not.toHaveBeenCalled();
  });

  it("returns 402 when the org has no active subscription", async () => {
    checkAndDecrementQuotaMock.mockRejectedValue(new NoActiveSubscriptionError("org_1"));
    const res = await POST(postRequest(validBody()));
    expect(res.status).toBe(402);
    expect(createMock).not.toHaveBeenCalled();
  });
});
