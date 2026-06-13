/**
 * Unit tests for lib/hedera/HederaService.ts (T102).
 *
 * `@hashgraph/sdk` is mocked (the module loads it via dynamic `import()`), so no
 * Hedera network is ever touched. Transaction classes are inert chainable stubs
 * whose `execute` is the shared `executeMock` spy, reconfigured per test.
 *
 * NOTE: task brief used `submitHCSMessage` / `mintNFT` / `mirrorUrl`. The shipped
 * exports are `submitToHCS` / `mintProofNFT` and the URL field is `mirrorNodeUrl`.
 * Tests assert the real surface. Hard rule: a Hedera failure must return null,
 * never throw — explicitly covered below.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { executeMock, closeMock, setOperatorMock } = vi.hoisted(() => ({
  executeMock: vi.fn(),
  closeMock: vi.fn(),
  setOperatorMock: vi.fn(),
}));

vi.mock("@hashgraph/sdk", () => {
  const client = { setOperator: setOperatorMock, close: closeMock };
  class TopicMessageSubmitTransaction {
    setTopicId() { return this; }
    setMessage() { return this; }
    execute = executeMock;
  }
  class TokenMintTransaction {
    setTokenId() { return this; }
    addMetadata() { return this; }
    execute = executeMock;
  }
  return {
    Client: { forTestnet: () => client, forMainnet: () => client },
    PrivateKey: { fromStringDer: vi.fn(() => "MOCK_KEY") },
    TopicMessageSubmitTransaction,
    TokenMintTransaction,
    TopicId: { fromString: (s: string) => s },
    TokenId: { fromString: (s: string) => s },
  };
});

import { submitToHCS, mintProofNFT, recordOnHedera } from "@/lib/hedera/HederaService";

const PAYLOAD = {
  deliveryId: "del-1",
  documentHash: "abc123",
  caseRef: "2026-NYC-0042",
  servedTo: "0xserved",
  servedBy: "0xserver",
};

beforeEach(() => {
  executeMock.mockReset();
  closeMock.mockReset();
  setOperatorMock.mockReset();
  process.env.HEDERA_OPERATOR_ID = "0.0.1001";
  process.env.HEDERA_OPERATOR_KEY = "302e0201...mock";
  process.env.HEDERA_HCS_TOPIC_ID = "0.0.5005";
  process.env.HEDERA_NFT_TOKEN_ID = "0.0.6006";
  process.env.HEDERA_NETWORK = "testnet";
});

afterEach(() => {
  delete process.env.HEDERA_OPERATOR_ID;
  delete process.env.HEDERA_OPERATOR_KEY;
  delete process.env.HEDERA_HCS_TOPIC_ID;
  delete process.env.HEDERA_NFT_TOKEN_ID;
  delete process.env.HEDERA_NETWORK;
});

describe("submitToHCS", () => {
  it("returns sequence number, consensus timestamp and mirror node URL", async () => {
    executeMock.mockResolvedValue({
      getReceipt: async () => ({
        topicSequenceNumber: { toNumber: () => 7 },
        consensusTimestamp: { toDate: () => new Date("2026-01-02T03:04:05Z") },
      }),
      transactionId: { toString: () => "0.0.1001@1700000000.0" },
    });

    const res = await submitToHCS(PAYLOAD);

    expect(res).not.toBeNull();
    expect(res!.sequenceNumber).toBe(7);
    expect(res!.consensusTimestamp).toBe("2026-01-02T03:04:05.000Z");
    expect(res!.topicId).toBe("0.0.5005");
    expect(res!.mirrorNodeUrl).toBe(
      "https://testnet.mirrornode.hedera.com/api/v1/topics/0.0.5005/messages/7",
    );
    expect(closeMock).toHaveBeenCalled();
  });

  it("builds a mainnet mirror node URL when HEDERA_NETWORK=mainnet", async () => {
    process.env.HEDERA_NETWORK = "mainnet";
    executeMock.mockResolvedValue({
      getReceipt: async () => ({
        topicSequenceNumber: { toNumber: () => 3 },
        consensusTimestamp: null,
      }),
      transactionId: { toString: () => "tx" },
    });

    const res = await submitToHCS(PAYLOAD);

    expect(res!.consensusTimestamp).toBeNull();
    expect(res!.mirrorNodeUrl).toContain("https://mainnet.mirrornode.hedera.com");
  });

  it("returns null (no throw) when HEDERA_HCS_TOPIC_ID is unset", async () => {
    delete process.env.HEDERA_HCS_TOPIC_ID;
    expect(await submitToHCS(PAYLOAD)).toBeNull();
    expect(executeMock).not.toHaveBeenCalled();
  });

  it("returns null and closes the client when the SDK throws", async () => {
    executeMock.mockRejectedValue(new Error("consensus failure"));
    await expect(submitToHCS(PAYLOAD)).resolves.toBeNull();
    expect(closeMock).toHaveBeenCalled();
  });
});

describe("mintProofNFT", () => {
  it("returns the serial number and mirror node URL", async () => {
    executeMock.mockResolvedValue({
      getReceipt: async () => ({ serials: [{ toNumber: () => 42 }] }),
      transactionId: { toString: () => "0.0.1001@1700000001.0" },
    });

    const res = await mintProofNFT({
      deliveryId: PAYLOAD.deliveryId,
      documentHash: PAYLOAD.documentHash,
      caseRef: PAYLOAD.caseRef,
    });

    expect(res).not.toBeNull();
    expect(res!.serialNumber).toBe(42);
    expect(res!.tokenId).toBe("0.0.6006");
    expect(res!.mirrorNodeUrl).toBe(
      "https://testnet.mirrornode.hedera.com/api/v1/tokens/0.0.6006/nfts/42",
    );
  });

  it("returns null (no throw) when the SDK mint throws", async () => {
    executeMock.mockRejectedValue(new Error("mint failure"));
    await expect(
      mintProofNFT({ deliveryId: "d", documentHash: "h", caseRef: "c" }),
    ).resolves.toBeNull();
  });

  it("returns null when HEDERA_NFT_TOKEN_ID is unset", async () => {
    delete process.env.HEDERA_NFT_TOKEN_ID;
    expect(
      await mintProofNFT({ deliveryId: "d", documentHash: "h", caseRef: "c" }),
    ).toBeNull();
  });
});

describe("recordOnHedera", () => {
  it("returns the { hcs, hts, bothSucceeded } shape", async () => {
    executeMock.mockRejectedValue(new Error("network"));
    const res = await recordOnHedera(PAYLOAD);
    expect(res).toHaveProperty("hcs");
    expect(res).toHaveProperty("hts");
    expect(res).toHaveProperty("bothSucceeded");
  });

  it("never throws and reports bothSucceeded=false when execute rejects", async () => {
    // submitToHCS + mintProofNFT are fanned out via Promise.allSettled; a thrown
    // SDK error on either leg must degrade to null, never reject the whole call.
    executeMock.mockRejectedValue(new Error("consensus down"));
    const res = await recordOnHedera(PAYLOAD);
    expect(res.bothSucceeded).toBe(false);
  });

  it("never throws and reports bothSucceeded=false when credentials are missing", async () => {
    delete process.env.HEDERA_OPERATOR_ID;
    const res = await recordOnHedera(PAYLOAD);
    expect(res.bothSucceeded).toBe(false);
  });
});
