import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock the network surface of web3.js so the unit suite never opens a socket:
// `Connection` becomes an inert handle whose `sendTransaction` /
// `confirmTransaction` / `getTransaction` are spies. Everything else (Keypair,
// PublicKey, SystemProgram, Transaction) is the real implementation so
// transaction-building logic is exercised for real.
const { sendTransaction, confirmTransaction, getTransaction } = vi.hoisted(() => ({
  sendTransaction: vi.fn(async (...args: unknown[]) => {
    void args;
    return "sig_111";
  }),
  confirmTransaction: vi.fn(async () => ({ value: { err: null } })),
  getTransaction: vi.fn(async () => ({ slot: 4242, blockTime: 1_700_000_000 })),
}));

vi.mock("@solana/web3.js", async (importActual) => {
  const actual = await importActual<typeof import("@solana/web3.js")>();
  return {
    ...actual,
    Connection: class {
      sendTransaction = sendTransaction;
      confirmTransaction = confirmTransaction;
      getTransaction = getTransaction;
    },
  };
});

import { SolanaAdapter, getSolanaAdapter } from "@/lib/chain/solana";

const DEVNET = "https://api.devnet.solana.com";

describe("SolanaAdapter.assertNotMainnet (hard rule #2)", () => {
  it("throws when constructed with the public mainnet-beta RPC", () => {
    expect(
      () => new SolanaAdapter("https://api.mainnet-beta.solana.com", Keypair.generate()),
    ).toThrow("Mainnet RPC forbidden");
  });

  it.each([
    "https://api.mainnet-beta.solana.com",
    "https://MAINNET.example.com",
    "https://my-private-mainnet-rpc.example.com/abc",
  ])("rejects any mainnet URL: %s", (url) => {
    expect(() => new SolanaAdapter(url, Keypair.generate())).toThrow("Mainnet RPC forbidden");
  });

  it("does NOT throw for devnet / localhost endpoints", () => {
    expect(() => new SolanaAdapter(DEVNET, Keypair.generate())).not.toThrow();
    expect(() => new SolanaAdapter("http://localhost:8899", Keypair.generate())).not.toThrow();
  });
});

describe("SolanaAdapter.send / confirm (persist-sig-before-confirm, T-304)", () => {
  beforeEach(() => {
    sendTransaction.mockClear();
    confirmTransaction.mockClear();
    getTransaction.mockClear();
  });

  it("send broadcasts a transfer+memo tx and returns the signature WITHOUT confirming", async () => {
    const adapter = new SolanaAdapter(DEVNET, Keypair.generate());
    const recipient = Keypair.generate().publicKey.toBase58();

    const signature = await adapter.send({
      recipientWallet: recipient,
      lamports: 890_880n,
      memoParts: ["notice:https://x.test/n/1", "svc:rec_1"],
    });

    expect(signature).toBe("sig_111");
    expect(sendTransaction).toHaveBeenCalledTimes(1);
    // send must NOT confirm — that is a separate step so the caller can persist
    // the signature in between (hard rule #4).
    expect(confirmTransaction).not.toHaveBeenCalled();
    // The built tx carries exactly two instructions: transfer + memo.
    const tx = sendTransaction.mock.calls[0][0] as unknown as { instructions: unknown[] };
    expect(tx.instructions).toHaveLength(2);
  });

  it("send rejects an off-curve (PDA-style) recipient before broadcasting", async () => {
    const adapter = new SolanaAdapter(DEVNET, Keypair.generate());
    await expect(
      adapter.send({
        recipientWallet: "not-a-valid-address!!!",
        lamports: 1n,
        memoParts: ["x"],
      }),
    ).rejects.toThrow();
    expect(sendTransaction).not.toHaveBeenCalled();
  });

  it("confirm finalizes a signature and reads back slot/blockTime (no re-send)", async () => {
    const adapter = new SolanaAdapter(DEVNET, Keypair.generate());

    const result = await adapter.confirm("sig_persisted");

    expect(confirmTransaction).toHaveBeenCalledWith("sig_persisted", "finalized");
    expect(getTransaction).toHaveBeenCalledTimes(1);
    expect(sendTransaction).not.toHaveBeenCalled();
    expect(result).toEqual({ slot: 4242, blockTime: 1_700_000_000 });
  });
});

describe("SolanaAdapter.deliver (send + confirm convenience)", () => {
  beforeEach(() => {
    sendTransaction.mockClear();
    confirmTransaction.mockClear();
    getTransaction.mockClear();
  });

  it("sends a transfer+memo tx and returns signature/slot/blockTime", async () => {
    const adapter = new SolanaAdapter(DEVNET, Keypair.generate());
    const recipient = Keypair.generate().publicKey.toBase58();

    const result = await adapter.deliver({
      recipientWallet: recipient,
      lamports: 890_880n,
      memoParts: ["sha256:abc", "notice:https://x.test/n/1", "svc:rec_1"],
    });

    expect(sendTransaction).toHaveBeenCalledTimes(1);
    expect(confirmTransaction).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ signature: "sig_111", slot: 4242, blockTime: 1_700_000_000 });
  });
});

describe("getSolanaAdapter (env factory)", () => {
  const ORIGINAL = { ...process.env };
  afterEach(() => {
    process.env = { ...ORIGINAL };
  });

  it("throws when SOLANA_RPC_URL is unset", () => {
    delete process.env.SOLANA_RPC_URL;
    process.env.SOLANA_SIGNER_KEYPAIR = "x";
    expect(() => getSolanaAdapter()).toThrow("SOLANA_RPC_URL is not set");
  });

  it("throws when SOLANA_SIGNER_KEYPAIR is unset", () => {
    process.env.SOLANA_RPC_URL = DEVNET;
    delete process.env.SOLANA_SIGNER_KEYPAIR;
    expect(() => getSolanaAdapter()).toThrow("SOLANA_SIGNER_KEYPAIR is not set");
  });

  it("refuses a mainnet RPC even via the factory", () => {
    process.env.SOLANA_RPC_URL = "https://api.mainnet-beta.solana.com";
    process.env.SOLANA_SIGNER_KEYPAIR = bs58.encode(Keypair.generate().secretKey);
    expect(() => getSolanaAdapter()).toThrow("Mainnet RPC forbidden");
  });

  it("builds an adapter from valid devnet env", () => {
    process.env.SOLANA_RPC_URL = DEVNET;
    process.env.SOLANA_SIGNER_KEYPAIR = bs58.encode(Keypair.generate().secretKey);
    expect(getSolanaAdapter()).toBeInstanceOf(SolanaAdapter);
  });
});
