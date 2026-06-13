/**
 * Unit tests for lib/hedera/HederaService.ts (T102).
 * The @hashgraph/sdk fluent API is mocked so no Hedera network calls are made.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { vi } from "vitest";

vi.mock("@hashgraph/sdk", () => {
  class TopicMessageSubmitTransaction {
    setTopicId() {
      return this;
    }
    setMessage() {
      return this;
    }
    async execute() {
      return {
        transactionId: { toString: () => "0.0.123@1700000000.000000000" },
        getReceipt: async () => ({
          topicSequenceNumber: { toNumber: () => 42 },
          consensusTimestamp: { toDate: () => new Date("2026-06-13T01:00:05.000Z") },
        }),
      };
    }
  }
  class TokenMintTransaction {
    setTokenId() {
      return this;
    }
    addMetadata() {
      return this;
    }
    async execute() {
      return {
        transactionId: { toString: () => "0.0.123@1700000001.000000000" },
        getReceipt: async () => ({ serials: [{ toNumber: () => 7 }] }),
      };
    }
  }
  return {
    TopicMessageSubmitTransaction,
    TokenMintTransaction,
    TopicId: { fromString: (s: string) => s },
    TokenId: { fromString: (s: string) => s },
    PrivateKey: { fromStringDer: () => ({}) },
    Client: {
      forTestnet: () => ({ setOperator() {}, close() {} }),
      forMainnet: () => ({ setOperator() {}, close() {} }),
    },
  };
});

import {
  submitToHCS,
  mintProofNFT,
  recordOnHedera,
} from "@/lib/hedera/HederaService";

const HEDERA_KEYS = [
  "HEDERA_HCS_TOPIC_ID",
  "HEDERA_NFT_TOKEN_ID",
  "HEDERA_OPERATOR_ID",
  "HEDERA_OPERATOR_KEY",
  "HEDERA_NETWORK",
] as const;

const PAYLOAD = {
  deliveryId: "del_1",
  documentHash: "a".repeat(64),
  caseRef: "2026-TEST-001",
  servedTo: "0x0000000000000000000000000000000000000001",
  servedBy: "eps-agent",
};

let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = {};
  for (const k of HEDERA_KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
});

afterEach(() => {
  for (const k of HEDERA_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe("submitToHCS", () => {
  it("returns null when HEDERA_HCS_TOPIC_ID is not set", async () => {
    expect(await submitToHCS(PAYLOAD)).toBeNull();
  });

  it("returns an HCS result when fully configured", async () => {
    process.env.HEDERA_HCS_TOPIC_ID = "0.0.123456";
    process.env.HEDERA_OPERATOR_ID = "0.0.1001";
    process.env.HEDERA_OPERATOR_KEY = "302e0201";
    const res = await submitToHCS(PAYLOAD);
    expect(res).not.toBeNull();
    expect(res?.topicId).toBe("0.0.123456");
    expect(res?.sequenceNumber).toBe(42);
    expect(res?.mirrorNodeUrl).toContain("testnet.mirrornode.hedera.com");
  });
});

describe("mintProofNFT", () => {
  it("returns null when HEDERA_NFT_TOKEN_ID is not set", async () => {
    expect(await mintProofNFT(PAYLOAD)).toBeNull();
  });

  it("returns an HTS mint result with a serial number when configured", async () => {
    process.env.HEDERA_NFT_TOKEN_ID = "0.0.654321";
    process.env.HEDERA_OPERATOR_ID = "0.0.1001";
    process.env.HEDERA_OPERATOR_KEY = "302e0201";
    const res = await mintProofNFT(PAYLOAD);
    expect(res?.tokenId).toBe("0.0.654321");
    expect(res?.serialNumber).toBe(7);
  });
});

describe("recordOnHedera", () => {
  it("does not throw and reports failure when nothing is configured", async () => {
    const res = await recordOnHedera(PAYLOAD);
    expect(res.hcs).toBeNull();
    expect(res.hts).toBeNull();
    expect(res.bothSucceeded).toBe(false);
  });
});
