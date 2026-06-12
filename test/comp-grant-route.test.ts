import { describe, it, expect, vi, beforeEach } from "vitest";
import { UnauthorizedError, ForbiddenError } from "../lib/auth";

// Mock the auth + db collaborators so the route can be exercised in isolation
// (no live Clerk session, no live Postgres).
const requireOrgAdminMock = vi.fn();
vi.mock("@/lib/auth", async () => {
  const actual = await vi.importActual<typeof import("../lib/auth")>("../lib/auth");
  return { ...actual, requireOrgAdmin: () => requireOrgAdminMock() };
});

const transactionMock = vi.fn();
vi.mock("@/lib/db", () => ({
  prisma: { $transaction: (cb: unknown) => transactionMock(cb) },
}));

import { POST } from "../app/api/admin/comp-grant/route";

function postRequest(body: unknown, init?: { raw?: string }): Request {
  return new Request("http://localhost:3000/api/admin/comp-grant", {
    method: "POST",
    headers: { "Content-Type": "application/json", origin: "http://localhost:3000" },
    body: init?.raw ?? JSON.stringify(body),
  });
}

describe("POST /api/admin/comp-grant", () => {
  beforeEach(() => {
    requireOrgAdminMock.mockReset();
    transactionMock.mockReset();
    requireOrgAdminMock.mockResolvedValue({ userId: "user_admin", orgId: "org_admin" });
    // Default: the transaction yields a freshly granted Tier3 subscription.
    transactionMock.mockResolvedValue({
      id: "sub_1",
      tierId: "tier3",
      status: "ACTIVE",
      periodEnd: new Date("2028-06-12T00:00:00.000Z"),
    });
  });

  it("returns 403 when the caller is not an org admin", async () => {
    requireOrgAdminMock.mockRejectedValue(new ForbiddenError());
    const res = await POST(postRequest({ targetOrgId: "org_target" }));
    expect(res.status).toBe(403);
    // No state transition should be attempted for a forbidden caller.
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("returns 401 when the request is unauthenticated", async () => {
    requireOrgAdminMock.mockRejectedValue(new UnauthorizedError());
    const res = await POST(postRequest({ targetOrgId: "org_target" }));
    expect(res.status).toBe(401);
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("returns 400 for a missing targetOrgId", async () => {
    const res = await POST(postRequest({}));
    expect(res.status).toBe(400);
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("returns 400 for a malformed JSON body", async () => {
    const res = await POST(postRequest(null, { raw: "{not json" }));
    expect(res.status).toBe(400);
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("grants a Tier3 comp subscription and reports it for an admin caller", async () => {
    const res = await POST(postRequest({ targetOrgId: "org_target" }));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      ok: true,
      grant: "Founders Legacy",
      subscription: {
        id: "sub_1",
        tierId: "tier3",
        status: "ACTIVE",
        periodEnd: "2028-06-12T00:00:00.000Z",
      },
    });
    expect(transactionMock).toHaveBeenCalledTimes(1);
  });

  it("writes Tier3/ACTIVE + a COMP_GRANT AuditLog in one transaction", async () => {
    // Drive the real transaction callback against an in-memory tx double so we
    // can assert the upsert + audit-log writes happen together.
    const tx = {
      organization: { upsert: vi.fn().mockResolvedValue({ id: "org_internal" }) },
      subscription: {
        findFirst: vi.fn().mockResolvedValue(null),
        update: vi.fn(),
        create: vi.fn().mockResolvedValue({
          id: "sub_new",
          tierId: "tier3",
          status: "ACTIVE",
          periodEnd: new Date("2028-06-12T00:00:00.000Z"),
        }),
      },
      auditLog: { create: vi.fn().mockResolvedValue({ id: "audit_1" }) },
    };
    transactionMock.mockImplementation((cb: (t: typeof tx) => unknown) => cb(tx));

    const res = await POST(postRequest({ targetOrgId: "org_target" }));
    expect(res.status).toBe(200);

    expect(tx.organization.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { clerkOrgId: "org_target" } }),
    );
    const createArg = tx.subscription.create.mock.calls[0][0];
    expect(createArg.data).toMatchObject({
      orgId: "org_internal",
      tierId: "tier3",
      status: "ACTIVE",
    });
    const auditArg = tx.auditLog.create.mock.calls[0][0];
    expect(auditArg.data).toMatchObject({
      action: "COMP_GRANT",
      actorId: "user_admin",
      targetId: "org_target",
    });
  });
});
