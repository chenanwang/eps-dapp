import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * T-306 integration test: a terminal delivery failure restores quota, parks the
 * request FAILED, and audits the transition.
 *
 * The CI integration job has no Postgres, so this drives the REAL code path —
 * `createServiceRequest` (intake), the `drain`/`runOnce`/`claimNext` worker loop,
 * `processServiceRequest`, and `failServiceRequest` (with the real
 * `checkAndDecrementQuota` / `restoreQuota`) — against an in-memory Prisma fake
 * with genuine `$transaction` rollback semantics. The chain `send` is mocked to
 * throw (the "mock sendTransaction to throw" scenario), so the delivery fails
 * terminally inside the worker.
 *
 * The assertion the gate cares about: across the full stage→fail cycle the quota
 * meter is left UNCHANGED — intake consumed a unit, the failure gave it back —
 * the row ends FAILED, and a SERVICE_FAILED audit row is written.
 */

// Document storage succeeds (intake must reach the STAGED commit); the failure
// is injected at chain-send time, not here.
vi.mock("@/lib/storage", () => ({
  storeDocument: vi.fn(async () => ({
    objectKey: "documents/abc-123",
    sha256: "deadbeefdeadbeef",
    iv: "00".repeat(12),
    authTag: "11".repeat(16),
  })),
}));

// Chain seam: `send` throws (RPC unreachable). buildServiceMemo /
// getRentExemptMinimum are pure stand-ins so the worker reaches the send.
const SEND_ERROR = "simulated send failure: RPC unreachable";
const { send } = vi.hoisted(() => ({
  send: vi.fn(async () => {
    throw new Error("simulated send failure: RPC unreachable");
  }),
}));

vi.mock("@/lib/chain", () => ({
  getSolanaAdapter: () => ({
    send,
    confirm: vi.fn(),
    getMemo: vi.fn(),
    deliver: vi.fn(),
    assertNotMainnet: () => {},
  }),
  getRentExemptMinimum: vi.fn(async () => 890_880n),
  buildServiceMemo: ({
    sha256,
    noticeToken,
    serviceId,
  }: {
    sha256: string;
    noticeToken: string;
    serviceId: string;
  }) => `${sha256}|${noticeToken}|${serviceId}`,
}));

// In-memory transactional Prisma fake shared by the `@/lib/db` mock and the test
// body (hoisted, like the intake test). Supports the exact query shapes intake,
// the worker claim, restoreQuota, and failServiceRequest issue.
const h = vi.hoisted(() => {
  interface SubRow {
    id: string;
    orgId: string;
    clerkOrgId: string;
    tierId: string;
    status: string;
    periodStart: Date;
    periodEnd: Date;
    usageCount: number;
  }
  interface SvcRow {
    id: string;
    orgId: string;
    caseCaption: string;
    plaintiffName: string;
    defendantName: string;
    recipientWallet: string;
    courtOrderFlag: boolean;
    attestedAt: Date;
    noticeToken: string | null;
    documentSha256: string | null;
    status: string;
    txSignature: string | null;
    slot: bigint | null;
    blockTime: Date | null;
    failureReason: string | null;
    createdAt: number;
  }
  interface Tables {
    subscriptions: SubRow[];
    serviceRequests: SvcRow[];
    auditLogs: Record<string, unknown>[];
  }

  const state: Tables = { subscriptions: [], serviceRequests: [], auditLogs: [] };
  let idCounter = 0;
  let clock = 0;
  const nextId = (p: string): string => `${p}_${++idCounter}`;

  function makeClient(store: Tables) {
    return {
      subscription: {
        // Matches both intake (organization.clerkOrgId) and restore (orgId).
        async findFirst({
          where,
          orderBy,
        }: {
          where?: {
            status?: string;
            orgId?: string;
            organization?: { clerkOrgId?: string };
          };
          orderBy?: { periodEnd?: "asc" | "desc" };
        }): Promise<SubRow | null> {
          let rows = store.subscriptions.filter((s) => {
            if (where?.status && s.status !== where.status) return false;
            if (where?.orgId && s.orgId !== where.orgId) return false;
            if (
              where?.organization?.clerkOrgId &&
              s.clerkOrgId !== where.organization.clerkOrgId
            ) {
              return false;
            }
            return true;
          });
          if (orderBy?.periodEnd === "desc") {
            rows = [...rows].sort(
              (a, b) => b.periodEnd.getTime() - a.periodEnd.getTime(),
            );
          }
          return rows[0] ?? null;
        },
        // Handles both the guarded increment (intake) and guarded decrement (restore).
        async updateMany({
          where,
          data,
        }: {
          where?: { id?: string; usageCount?: { lt?: number; gt?: number } };
          data?: { usageCount?: { increment?: number; decrement?: number } };
        }): Promise<{ count: number }> {
          let count = 0;
          for (const s of store.subscriptions) {
            if (where?.id && s.id !== where.id) continue;
            if (where?.usageCount?.lt !== undefined && !(s.usageCount < where.usageCount.lt))
              continue;
            if (where?.usageCount?.gt !== undefined && !(s.usageCount > where.usageCount.gt))
              continue;
            if (data?.usageCount?.increment !== undefined)
              s.usageCount += data.usageCount.increment;
            if (data?.usageCount?.decrement !== undefined)
              s.usageCount -= data.usageCount.decrement;
            count++;
          }
          return { count };
        },
        async update({
          where,
          data,
        }: {
          where: { id: string };
          data: Partial<SubRow>;
        }): Promise<SubRow> {
          const s = store.subscriptions.find((x) => x.id === where.id);
          if (!s) throw new Error("subscription not found");
          Object.assign(s, data);
          return { ...s };
        },
      },
      serviceRequest: {
        async create({
          data,
          select,
        }: {
          data: Record<string, unknown> & {
            organization?: { connect?: { clerkOrgId?: string } };
          };
          select?: Record<string, boolean>;
        }): Promise<Record<string, unknown>> {
          const clerkOrgId = data.organization?.connect?.clerkOrgId;
          const sub = store.subscriptions.find((s) => s.clerkOrgId === clerkOrgId);
          const row: SvcRow = {
            id: nextId("svc"),
            orgId: sub?.orgId ?? String(clerkOrgId),
            caseCaption: data.caseCaption as string,
            plaintiffName: data.plaintiffName as string,
            defendantName: data.defendantName as string,
            recipientWallet: data.recipientWallet as string,
            courtOrderFlag: data.courtOrderFlag as boolean,
            attestedAt: data.attestedAt as Date,
            noticeToken: (data.noticeToken as string) ?? null,
            documentSha256: (data.documentSha256 as string) ?? null,
            status: data.status as string,
            txSignature: null,
            slot: null,
            blockTime: null,
            failureReason: null,
            createdAt: ++clock,
          };
          store.serviceRequests.push(row);
          if (select) {
            const out: Record<string, unknown> = {};
            for (const k of Object.keys(select))
              if (select[k]) out[k] = (row as unknown as Record<string, unknown>)[k];
            return out;
          }
          return { ...row };
        },
        async findFirst({
          where,
          orderBy,
          select,
        }: {
          where: { status: { in: readonly string[] } };
          orderBy: { createdAt: "asc" | "desc" };
          select?: Record<string, boolean>;
        }): Promise<Record<string, unknown> | null> {
          const rows = store.serviceRequests
            .filter((r) => where.status.in.includes(r.status))
            .sort((a, b) =>
              orderBy.createdAt === "asc"
                ? a.createdAt - b.createdAt
                : b.createdAt - a.createdAt,
            );
          const r = rows[0];
          if (!r) return null;
          if (!select) return { ...r };
          const out: Record<string, unknown> = {};
          for (const k of Object.keys(select))
            if (select[k]) out[k] = (r as unknown as Record<string, unknown>)[k];
          return out;
        },
        async updateMany({
          where,
          data,
        }: {
          where: { id: string; status: { in: readonly string[] } };
          data: { status: string };
        }): Promise<{ count: number }> {
          let count = 0;
          for (const r of store.serviceRequests) {
            if (r.id !== where.id) continue;
            if (!where.status.in.includes(r.status)) continue;
            r.status = data.status;
            count++;
          }
          return { count };
        },
        async update({
          where,
          data,
        }: {
          where: { id: string };
          data: Record<string, unknown>;
        }): Promise<Record<string, unknown>> {
          const r = store.serviceRequests.find((x) => x.id === where.id);
          if (!r) throw new Error(`service request ${where.id} not found`);
          Object.assign(r, data);
          return { ...r };
        },
      },
      auditLog: {
        async create({
          data,
        }: {
          data: Record<string, unknown>;
        }): Promise<Record<string, unknown>> {
          const row = { id: nextId("audit"), ...data };
          store.auditLogs.push(row);
          return { ...row };
        },
      },
    };
  }

  type FakeClient = ReturnType<typeof makeClient>;

  const db = {
    ...makeClient(state),
    async $transaction(fn: (tx: FakeClient) => Promise<unknown>): Promise<unknown> {
      const working: Tables = structuredClone(state);
      const result = await fn(makeClient(working));
      state.subscriptions = working.subscriptions;
      state.serviceRequests = working.serviceRequests;
      state.auditLogs = working.auditLogs;
      return result;
    },
  };

  function seed() {
    idCounter = 0;
    clock = 0;
    state.subscriptions = [
      {
        id: "sub_1",
        orgId: "org_internal_1",
        clerkOrgId: "org_1",
        tierId: "tier1", // limit 1 — a failed delivery must give the only unit back
        status: "ACTIVE",
        periodStart: new Date("2020-01-01T00:00:00Z"),
        periodEnd: new Date("2099-12-31T00:00:00Z"),
        usageCount: 0,
      },
    ];
    state.serviceRequests = [];
    state.auditLogs = [];
  }

  return { db, state, seed };
});

vi.mock("@/lib/db", () => ({ prisma: h.db }));

import { createServiceRequest } from "@/lib/intake";
import { drain, defaultDeps } from "@/worker/index";

function usage(): number {
  return (h.state.subscriptions[0] as { usageCount: number }).usageCount;
}

describe("failure path — quota restore + FAILED + audit (T-306)", () => {
  beforeEach(() => {
    h.seed();
    vi.clearAllMocks();
  });

  it("restores quota (usageCount unchanged across stage→fail), parks FAILED, audits SERVICE_FAILED", async () => {
    const before = usage(); // 0

    // --- Intake: consumes one quota unit, stages the request. ---
    const staged = await createServiceRequest({
      orgId: "org_1",
      actorId: "user_1",
      caseCaption: "Smith v. Jones, No. 24-CV-1234",
      plaintiffName: "Smith",
      defendantName: "Jones",
      recipientWallet: "RecipientWalletAddress1111111111111111111111",
      courtOrderFlag: false,
      document: Buffer.from("%PDF-1.7 confidential filing"),
    });
    expect(staged.status).toBe("STAGED");
    expect(usage()).toBe(before + 1); // unit consumed

    // --- Worker drains: the chain send throws, so delivery fails terminally. ---
    const processed = await drain(defaultDeps());
    expect(processed).toBe(1);
    expect(send).toHaveBeenCalledTimes(1); // delivery was attempted

    // Quota restored: net-zero across the full stage→fail cycle.
    expect(usage()).toBe(before);

    // The request is parked FAILED with the diagnostic reason for the dashboard.
    const row = h.state.serviceRequests[0];
    expect(row.status).toBe("FAILED");
    expect(row.failureReason).toContain(SEND_ERROR);

    // A SERVICE_FAILED audit row was written alongside the STAGED one.
    const actions = h.state.auditLogs.map((a) => a.action);
    expect(actions).toContain("SERVICE_REQUEST_STAGED");
    expect(actions).toContain("SERVICE_FAILED");
    const failed = h.state.auditLogs.find((a) => a.action === "SERVICE_FAILED");
    expect(failed?.targetId).toBe(staged.id);
    expect((failed?.metadata as { quotaRestored?: boolean }).quotaRestored).toBe(true);
  });

  it("drain re-claims nothing once the row is terminal (no spin)", async () => {
    await createServiceRequest({
      orgId: "org_1",
      actorId: "user_1",
      caseCaption: "A v. B",
      plaintiffName: "A",
      defendantName: "B",
      recipientWallet: "RecipientWalletAddress1111111111111111111111",
      courtOrderFlag: false,
      document: Buffer.from("%PDF-1.7"),
    });

    expect(await drain(defaultDeps())).toBe(1); // claimed + failed once
    expect(await drain(defaultDeps())).toBe(0); // FAILED is terminal — nothing left
  });
});
