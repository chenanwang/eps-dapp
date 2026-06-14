import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { UnauthorizedError } from "../lib/auth";

// Mock auth + db so the route runs without a live Clerk session or Postgres
// (issue #125). The route's own demo-mode gate is exercised via env vars.
const requireUserMock = vi.fn();
vi.mock("@/lib/auth", async () => {
  const actual = await vi.importActual<typeof import("../lib/auth")>("../lib/auth");
  return { ...actual, requireUser: () => requireUserMock() };
});

// A minimal transactional client: $transaction invokes its callback with a `tx`
// exposing the serviceRequest/auditLog calls the route uses.
const findFirstMock = vi.fn();
const updateMock = vi.fn();
const auditCreateMock = vi.fn();
vi.mock("@/lib/db", () => ({
  prisma: {
    $transaction: (fn: (tx: unknown) => unknown) =>
      Promise.resolve(
        fn({
          serviceRequest: {
            findFirst: (args: unknown) => findFirstMock(args),
            update: (args: unknown) => updateMock(args),
          },
          auditLog: { create: (args: unknown) => auditCreateMock(args) },
        }),
      ),
  },
}));

import { POST } from "../app/api/demo/skip-payment/route";

function postRequest(body: unknown, init?: { raw?: string }): Request {
  return new Request("http://localhost:3000/api/demo/skip-payment", {
    method: "POST",
    headers: { "Content-Type": "application/json", origin: "http://localhost:3000" },
    body: init?.raw ?? JSON.stringify(body),
  });
}

const ORIGINAL_DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE;

describe("POST /api/demo/skip-payment", () => {
  beforeEach(() => {
    requireUserMock.mockReset();
    findFirstMock.mockReset();
    updateMock.mockReset();
    auditCreateMock.mockReset();
    process.env.NEXT_PUBLIC_DEMO_MODE = "true";
    requireUserMock.mockResolvedValue({ userId: "user_123", orgId: "org_456" });
    findFirstMock.mockResolvedValue({ id: "svc_1", status: "STAGED" });
    updateMock.mockResolvedValue({ id: "svc_1", status: "IN_PROGRESS" });
    auditCreateMock.mockResolvedValue({});
  });

  afterEach(() => {
    process.env.NEXT_PUBLIC_DEMO_MODE = ORIGINAL_DEMO_MODE;
  });

  it("returns 403 when demo mode is disabled, without touching auth or the db", async () => {
    delete process.env.NEXT_PUBLIC_DEMO_MODE;
    const res = await POST(postRequest({ serviceId: "svc_1" }));
    expect(res.status).toBe(403);
    expect(requireUserMock).not.toHaveBeenCalled();
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("returns 403 when NEXT_PUBLIC_DEMO_MODE is not exactly 'true'", async () => {
    process.env.NEXT_PUBLIC_DEMO_MODE = "1";
    const res = await POST(postRequest({ serviceId: "svc_1" }));
    expect(res.status).toBe(403);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("returns 401 when the request is unauthenticated", async () => {
    requireUserMock.mockRejectedValue(new UnauthorizedError());
    const res = await POST(postRequest({ serviceId: "svc_1" }));
    expect(res.status).toBe(401);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("returns 400 for a malformed JSON body", async () => {
    const res = await POST(postRequest(null, { raw: "{not json" }));
    expect(res.status).toBe(400);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("returns 400 when serviceId is missing", async () => {
    const res = await POST(postRequest({}));
    expect(res.status).toBe(400);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("returns 404 when the request is not owned by the caller", async () => {
    findFirstMock.mockResolvedValue(null);
    const res = await POST(postRequest({ serviceId: "svc_other" }));
    expect(res.status).toBe(404);
    expect(updateMock).not.toHaveBeenCalled();
    expect(auditCreateMock).not.toHaveBeenCalled();
  });

  it("returns 409 when the request is not in the STAGED state", async () => {
    findFirstMock.mockResolvedValue({ id: "svc_1", status: "CONFIRMED" });
    const res = await POST(postRequest({ serviceId: "svc_1" }));
    expect(res.status).toBe(409);
    expect(updateMock).not.toHaveBeenCalled();
    expect(auditCreateMock).not.toHaveBeenCalled();
  });

  it("advances STAGED → IN_PROGRESS and audits the transition in the same tx", async () => {
    const res = await POST(postRequest({ serviceId: "svc_1" }));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ id: "svc_1", status: "IN_PROGRESS" });

    // Ownership is scoped to the caller (userId / active org), never the body.
    const whereArg = (findFirstMock.mock.calls[0][0] as { where: { id: string; OR: unknown[] } })
      .where;
    expect(whereArg.id).toBe("svc_1");
    expect(whereArg.OR).toEqual([
      { userId: "user_123" },
      { organization: { clerkOrgId: "org_456" } },
    ]);

    expect(updateMock).toHaveBeenCalledWith({
      where: { id: "svc_1" },
      data: { status: "IN_PROGRESS" },
    });

    // Hard rule #5: the state transition writes its audit row in the same tx.
    expect(auditCreateMock).toHaveBeenCalledTimes(1);
    const auditArg = auditCreateMock.mock.calls[0][0] as {
      data: { action: string; actorId: string; targetId: string };
    };
    expect(auditArg.data.action).toBe("DEMO_PAYMENT_SKIPPED");
    expect(auditArg.data.actorId).toBe("user_123");
    expect(auditArg.data.targetId).toBe("svc_1");
  });

  it("scopes ownership to userId only when the caller has no active org", async () => {
    requireUserMock.mockResolvedValue({ userId: "user_789", orgId: null });
    await POST(postRequest({ serviceId: "svc_1" }));
    const whereArg = (findFirstMock.mock.calls[0][0] as { where: { OR: unknown[] } }).where;
    expect(whereArg.OR).toEqual([{ userId: "user_789" }]);
  });
});
