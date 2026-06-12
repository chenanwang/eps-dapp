import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * T-304 fault test: persist signature pre-confirm; resume re-confirms, never
 * re-sends.
 *
 * The chain seam is mocked so no socket is opened: `send` returns a signature,
 * `confirm` returns slot/blockTime, and we can drive `confirm` to throw to
 * simulate a worker dying mid-confirmation. Everything else is the REAL code
 * path — `processServiceRequest` (worker/process.ts) plus the `claimNext` /
 * `drain` loop (the body of `worker:once`) against an in-memory `ServiceRequest`
 * table with the same atomic-claim semantics Prisma gives us.
 *
 * The scenario mirrors a real crash/restart:
 *   1. First run sends the tx and PERSISTS `txSignature` (row still IN_PROGRESS),
 *      then the process is "killed" mid-confirm (confirm throws once).
 *   2. `worker:once` restarts, RE-CLAIMS the IN_PROGRESS row, sees the signature
 *      already on record, and goes straight to confirm — `send` is never called
 *      a second time — driving the row to CONFIRMED with slot/blockTime.
 */

const SHA = "abc123def456abc123def456abc123def456abc123def456abc123def456abcd";
const TOKEN = "0123456789abcdef0123456789abcdef";

const { send, confirm, getMemo, getRentExemptMinimum } = vi.hoisted(() => ({
  send: vi.fn(async () => "sig_persisted"),
  confirm: vi.fn(async () => ({ slot: 4242, blockTime: 1_700_000_000 })),
  // Post-confirm re-read returns the memo we intended to send (T-305) so the
  // happy/resume paths verify and reach CONFIRMED.
  getMemo: vi.fn(async () => `${SHA}|${TOKEN}|svc_1`),
  getRentExemptMinimum: vi.fn(async () => 890_880n),
}));

vi.mock("@/lib/chain", () => ({
  getSolanaAdapter: () => ({
    send,
    confirm,
    getMemo,
    deliver: vi.fn(),
    assertNotMainnet: () => {},
  }),
  getRentExemptMinimum,
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

import { processServiceRequest } from "@/worker/process";
import {
  claimNext,
  drain,
  type ClaimableRequest,
  type WorkerDb,
  type WorkerDeps,
} from "@/worker/index";

interface Row {
  id: string;
  status: string;
  orgId: string;
  recipientWallet: string;
  noticeToken: string | null;
  documentSha256: string | null;
  txSignature: string | null;
  slot: bigint | null;
  blockTime: Date | null;
  failureReason?: string | null;
  createdAt: number;
}

/** Minimal in-memory table with Prisma-compatible claim/update semantics. */
function makeDb(rows: Row[]): WorkerDb {
  return {
    serviceRequest: {
      async findFirst({ where, orderBy, select }) {
        const match = rows
          .filter((r) => where.status.in.includes(r.status))
          .sort((a, b) =>
            orderBy.createdAt === "asc"
              ? a.createdAt - b.createdAt
              : b.createdAt - a.createdAt,
          )[0];
        if (!match) return null;
        if (!select) return { ...match } as unknown as ClaimableRequest;
        const out: Record<string, unknown> = {};
        for (const k of Object.keys(select)) {
          if (select[k]) out[k] = (match as unknown as Record<string, unknown>)[k];
        }
        return out as unknown as ClaimableRequest;
      },
      async updateMany({ where, data }) {
        let count = 0;
        for (const r of rows) {
          if (r.id !== where.id) continue;
          if (!where.status.in.includes(r.status)) continue; // guard failed
          r.status = data.status;
          count += 1;
        }
        return { count };
      },
      async update({ where, data }) {
        const r = rows.find((x) => x.id === where.id);
        if (!r) throw new Error(`row ${where.id} not found`);
        Object.assign(r, data);
        return { ...r };
      },
    },
  };
}

function row(overrides: Partial<Row> = {}): Row {
  return {
    id: "svc_1",
    status: "STAGED",
    orgId: "org_internal_1",
    recipientWallet: "RecipientWalletAddress1111111111111111111111",
    noticeToken: TOKEN,
    documentSha256: SHA,
    txSignature: null,
    slot: null,
    blockTime: null,
    createdAt: 1,
    ...overrides,
  };
}

function makeDeps(db: WorkerDb): WorkerDeps {
  return {
    db,
    process: processServiceRequest,
    log: () => {},
    fail: async (row, reason) => {
      await db.serviceRequest.update({
        where: { id: row.id },
        data: { status: "FAILED", failureReason: reason },
      });
    },
  };
}

describe("worker resume — persist sig pre-confirm (T-304)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("persists txSignature before confirming, then resumes by re-confirming (never re-sends)", async () => {
    const rows = [row({ status: "STAGED" })];
    const db = makeDb(rows);

    // --- First run: claim, send, persist signature, then DIE mid-confirm. ---
    const claimed = await claimNext(makeDeps(db));
    if (!claimed) throw new Error("expected to claim the staged row");
    expect(claimed.status).toBe("IN_PROGRESS");

    confirm.mockRejectedValueOnce(new Error("rpc blip — process killed"));
    await expect(processServiceRequest(claimed, db)).rejects.toThrow("rpc blip");

    // Signature was persisted BEFORE confirm (hard rule #4); the row is still
    // IN_PROGRESS (not yet CONFIRMED) — exactly the state a crash would leave.
    expect(send).toHaveBeenCalledTimes(1);
    expect(rows[0].txSignature).toBe("sig_persisted");
    expect(rows[0].status).toBe("IN_PROGRESS");
    expect(rows[0].slot).toBeNull();

    // --- Restart: `worker:once` drains the backlog, re-claiming the orphan. ---
    const processed = await drain(makeDeps(db));

    expect(processed).toBe(1);
    // Re-confirmed, NOT re-sent: send stays at one call across the restart.
    expect(send).toHaveBeenCalledTimes(1);
    expect(confirm).toHaveBeenLastCalledWith("sig_persisted");
    expect(rows[0]).toMatchObject({
      status: "CONFIRMED",
      txSignature: "sig_persisted",
      slot: 4242n,
    });
    expect(rows[0].blockTime).toEqual(new Date(1_700_000_000 * 1000));
  });

  it("a fresh STAGED row sends once then confirms to CONFIRMED with slot/blockTime", async () => {
    const rows = [row({ status: "STAGED" })];
    const db = makeDb(rows);

    const processed = await drain(makeDeps(db));

    expect(processed).toBe(1);
    expect(send).toHaveBeenCalledTimes(1);
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(rows[0]).toMatchObject({
      status: "CONFIRMED",
      txSignature: "sig_persisted",
      slot: 4242n,
    });
  });
});
