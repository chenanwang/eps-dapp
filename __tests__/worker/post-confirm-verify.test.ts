import { MEMO_PROGRAM_ID } from "@solana/spl-memo";
import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ClaimableRequest, WorkerDb } from "@/worker/index";

/**
 * T-305: post-confirm re-read verification.
 *
 * Drives the REAL `processServiceRequest` through the REAL `SolanaAdapter`
 * (env-built), with only the `@solana/web3.js` network surface mocked. The key
 * lever is `getTransaction`: after the worker sends + confirms, it re-reads the
 * on-chain memo via `getTransaction` and compares it to the canonical memo it
 * intended (`${sha256}|${noticeToken}|${serviceId}`). When `getTransaction`
 * returns a transaction whose memo does NOT match, an alert must be logged and
 * the processor must THROW a terminal failure — never reporting CONFIRMED. The
 * FAILED parking + quota restore is the worker's failure handler (T-306),
 * covered in failure-path.integration.test.ts; here we assert the verification
 * itself alerts and throws (and that the signature was still persisted first).
 */

const {
  sendTransaction,
  confirmTransaction,
  getTransaction,
  getMinimumBalanceForRentExemption,
} = vi.hoisted(() => ({
  sendTransaction: vi.fn(async () => "sig_onchain"),
  confirmTransaction: vi.fn(async () => ({ value: { err: null } })),
  getTransaction: vi.fn(),
  getMinimumBalanceForRentExemption: vi.fn(async () => 890_880),
}));

vi.mock("@solana/web3.js", async (importActual) => {
  const actual = await importActual<typeof import("@solana/web3.js")>();
  return {
    ...actual,
    Connection: class {
      sendTransaction = sendTransaction;
      confirmTransaction = confirmTransaction;
      getTransaction = getTransaction;
      getMinimumBalanceForRentExemption = getMinimumBalanceForRentExemption;
    },
  };
});

import { processServiceRequest } from "@/worker/process";

const DEVNET = "https://api.devnet.solana.com";
const SHA = "deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef0";
const TOKEN = "0123456789abcdef0123456789abcdef";

/** A finalized `getTransaction` response whose memo instruction carries `memo`. */
function txWithMemo(memo: string) {
  return {
    slot: 4242,
    blockTime: 1_700_000_000,
    transaction: {
      message: {
        accountKeys: [MEMO_PROGRAM_ID],
        instructions: [
          { programIdIndex: 0, accounts: [], data: bs58.encode(Buffer.from(memo)) },
        ],
      },
    },
  };
}

/** A one-row in-memory `ServiceRequest` table; `update` mutates the row. */
function makeDb(store: Record<string, unknown>): WorkerDb {
  return {
    serviceRequest: {
      findFirst: async () => null,
      updateMany: async () => ({ count: 0 }),
      update: async ({ data }) => {
        Object.assign(store, data);
        return { ...store };
      },
    },
  };
}

function makeRow(): { row: ClaimableRequest; store: Record<string, unknown> } {
  const row: ClaimableRequest = {
    id: "svc_1",
    status: "IN_PROGRESS",
    orgId: "org_internal_1",
    recipientWallet: Keypair.generate().publicKey.toBase58(),
    noticeToken: TOKEN,
    documentSha256: SHA,
    txSignature: null,
    caseCaption: "Acme Corp v. Doe, No. 24-CV-001",
    agentENSName: null,
  };
  return { row, store: { ...row } };
}

describe("post-confirm re-read verification (T-305)", () => {
  const ORIGINAL = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SOLANA_RPC_URL = DEVNET;
    process.env.SOLANA_SIGNER_KEYPAIR = bs58.encode(Keypair.generate().secretKey);
  });

  afterEach(() => {
    process.env = { ...ORIGINAL };
    vi.restoreAllMocks();
  });

  it("alerts and throws a terminal failure when the on-chain memo does not match", async () => {
    const { row, store } = makeRow();
    // The chain returns a memo that does NOT equal `${SHA}|${TOKEN}|svc_1`.
    getTransaction.mockResolvedValue(txWithMemo(`TAMPERED|${TOKEN}|svc_1`));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    // The mismatch is a terminal failure: it throws (the worker's failure
    // handler then parks FAILED + restores quota — T-306), never CONFIRMED.
    await expect(processServiceRequest(row, makeDb(store))).rejects.toThrow(
      /does not match the expected delivery memo/,
    );

    // Signature was still persisted before confirm (hard rule #4)...
    expect(sendTransaction).toHaveBeenCalledTimes(1);
    expect(store.txSignature).toBe("sig_onchain");
    // ...the processor does NOT itself confirm the row (no CONFIRMED), and the
    // alert was logged for the mismatch.
    expect(store.status).not.toBe("CONFIRMED");
    expect(store.slot).toBeUndefined();
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(String(errorSpy.mock.calls[0][0])).toContain("memo verification FAILED");
  });

  it("confirms the row when the on-chain memo matches what was sent", async () => {
    const { row, store } = makeRow();
    getTransaction.mockResolvedValue(txWithMemo(`${SHA}|${TOKEN}|svc_1`));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await processServiceRequest(row, makeDb(store));

    expect(store.status).toBe("CONFIRMED");
    expect(store.slot).toBe(4242n);
    expect(store.blockTime).toEqual(new Date(1_700_000_000 * 1000));
    expect(errorSpy).not.toHaveBeenCalled();
  });
});
