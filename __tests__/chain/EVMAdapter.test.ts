/**
 * Unit tests for lib/chain/EVMAdapter.ts (T102).
 *
 * viem's `createPublicClient` / `createWalletClient` are mocked so no RPC socket
 * is opened; the rest of viem (encodeFunctionData, parseEther, address helpers,
 * privateKeyToAccount) is the real implementation. The app wallet key is
 * GENERATED at setup via `generatePrivateKey()` — never committed (hard rule #1).
 *
 * NOTE: task brief referred to `validateRecipientAddress(...)` returning a
 * `normalised` field. The shipped `ChainAdapter` contract is
 * `validateAddress(address): { valid, reason? }`. Tests assert that real surface.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { generatePrivateKey } from "viem/accounts";

const { sendTransaction, waitForTransactionReceipt, getBlock, getTransaction } =
  vi.hoisted(() => ({
    sendTransaction: vi.fn(),
    waitForTransactionReceipt: vi.fn(),
    getBlock: vi.fn(),
    getTransaction: vi.fn(),
  }));

vi.mock("viem", async (importActual) => {
  const actual = await importActual<typeof import("viem")>();
  return {
    ...actual,
    createPublicClient: () => ({ waitForTransactionReceipt, getBlock, getTransaction }),
    createWalletClient: () => ({ sendTransaction }),
  };
});

import { EVMAdapter } from "@/lib/chain/EVMAdapter";
import { ChainId, ChainError, ChainErrorCode } from "@/lib/chain/ChainAdapter";

const VALID_ADDR = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";

beforeEach(() => {
  sendTransaction.mockReset();
  waitForTransactionReceipt.mockReset();
  getBlock.mockReset();
  getTransaction.mockReset();
  // Generated per run — not a committed secret.
  process.env.EVM_APP_WALLET_PRIVATE_KEY = generatePrivateKey();
});

afterEach(() => {
  delete process.env.EVM_APP_WALLET_PRIVATE_KEY;
  delete process.env.EVM_REGISTRY_ADDRESS;
  delete process.env.ALLOW_EVM_MAINNET;
});

describe("constructor", () => {
  it("throws NOT_IMPLEMENTED for an unknown chainId", () => {
    expect(() => new EVMAdapter("eip155:99999" as ChainId)).toThrowError(ChainError);
    try {
      new EVMAdapter("eip155:99999" as ChainId);
    } catch (err) {
      expect((err as ChainError).code).toBe(ChainErrorCode.NOT_IMPLEMENTED);
    }
  });
});

describe("validateAddress", () => {
  const adapter = new EVMAdapter(ChainId.ETH_SEPOLIA);

  it("returns { valid: true } for a well-formed EVM address", () => {
    expect(adapter.validateAddress(VALID_ADDR)).toEqual({ valid: true });
  });

  it("returns { valid: false, reason } for a malformed address", () => {
    const res = adapter.validateAddress("notanaddress");
    expect(res.valid).toBe(false);
    expect(res.reason).toMatch(/not a valid EVM address/);
  });

  it("rejects an address of the wrong length", () => {
    expect(adapter.validateAddress("0x1234").valid).toBe(false);
  });
});

describe("broadcast (testnet, self-transfer memo path)", () => {
  it("sends a 0-value tx carrying the memo and returns the tx hash", async () => {
    sendTransaction.mockResolvedValue("0xhash123");
    const adapter = new EVMAdapter(ChainId.ETH_SEPOLIA);

    const res = await adapter.broadcast({
      deliveryId: "del-1",
      documentHash: "abc",
      caseRef: "2026-NYC-1",
      servedTo: VALID_ADDR,
      servedBy: VALID_ADDR,
      servedAt: "2026-06-13T00:00:00Z",
    });

    expect(res).toEqual({ txId: "0xhash123", chainId: ChainId.ETH_SEPOLIA });
    const sent = sendTransaction.mock.calls[0][0];
    // memo is hex-encoded JSON beginning with the eps marker
    expect(sent.data.startsWith("0x")).toBe(true);
    expect(Buffer.from(sent.data.slice(2), "hex").toString("utf8")).toContain('"eps":"v1"');
  });

  it("wraps a send failure in a BROADCAST_FAILED ChainError", async () => {
    sendTransaction.mockRejectedValue(new Error("insufficient funds"));
    const adapter = new EVMAdapter(ChainId.ETH_SEPOLIA);

    await expect(
      adapter.broadcast({
        deliveryId: "d",
        documentHash: "h",
        caseRef: "c",
        servedTo: VALID_ADDR,
        servedBy: VALID_ADDR,
        servedAt: "2026-06-13T00:00:00Z",
      }),
    ).rejects.toMatchObject({ code: ChainErrorCode.BROADCAST_FAILED });
  });
});

describe("broadcast (mainnet guard, hard rule #2)", () => {
  it("throws MAINNET_FORBIDDEN unless ALLOW_EVM_MAINNET=true", async () => {
    const adapter = new EVMAdapter(ChainId.ETH_MAINNET);

    await expect(
      adapter.broadcast({
        deliveryId: "d",
        documentHash: "h",
        caseRef: "c",
        servedTo: VALID_ADDR,
        servedBy: VALID_ADDR,
        servedAt: "2026-06-13T00:00:00Z",
      }),
    ).rejects.toMatchObject({ code: ChainErrorCode.MAINNET_FORBIDDEN });
    expect(sendTransaction).not.toHaveBeenCalled();
  });
});

describe("getMemo", () => {
  it("decodes hex calldata back to a UTF-8 string", async () => {
    const memo = '{"eps":"v1","deliveryId":"del-1"}';
    getTransaction.mockResolvedValue({
      input: ("0x" + Buffer.from(memo, "utf8").toString("hex")) as `0x${string}`,
    });
    const adapter = new EVMAdapter(ChainId.ETH_SEPOLIA);

    expect(await adapter.getMemo("0xtx")).toBe(memo);
  });

  it("returns null when the tx has no calldata", async () => {
    getTransaction.mockResolvedValue({ input: "0x" });
    const adapter = new EVMAdapter(ChainId.ETH_SEPOLIA);

    expect(await adapter.getMemo("0xtx")).toBeNull();
  });

  it("returns null (no throw) when the lookup fails", async () => {
    getTransaction.mockRejectedValue(new Error("rpc error"));
    const adapter = new EVMAdapter(ChainId.ETH_SEPOLIA);

    expect(await adapter.getMemo("0xtx")).toBeNull();
  });
});

describe("confirm", () => {
  it("returns block number, timestamp and the confirmed memo", async () => {
    waitForTransactionReceipt.mockResolvedValue({
      blockNumber: 123n,
      blockHash: "0xblock",
    });
    getBlock.mockResolvedValue({ timestamp: 1_700_000_000n });
    getTransaction.mockResolvedValue({
      input: ("0x" + Buffer.from("memo", "utf8").toString("hex")) as `0x${string}`,
    });
    const adapter = new EVMAdapter(ChainId.ETH_SEPOLIA);

    const res = await adapter.confirm("0xtx");

    expect(res.blockNumber).toBe(123);
    expect(res.blockTimestamp).toBe(1_700_000_000);
    expect(res.confirmedMemo).toBe("memo");
    expect(res.chainId).toBe(ChainId.ETH_SEPOLIA);
  });

  it("wraps a receipt failure in a CONFIRMATION_FAILED ChainError", async () => {
    waitForTransactionReceipt.mockRejectedValue(new Error("timeout"));
    const adapter = new EVMAdapter(ChainId.ETH_SEPOLIA);

    await expect(adapter.confirm("0xtx")).rejects.toMatchObject({
      code: ChainErrorCode.CONFIRMATION_FAILED,
    });
  });
});
