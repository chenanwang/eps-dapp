import { MEMO_PROGRAM_ID } from "@solana/spl-memo";
import {
  Keypair,
  PublicKey,
  SystemInstruction,
  SystemProgram,
  type Connection,
} from "@solana/web3.js";
import { describe, expect, it, vi } from "vitest";

import { buildServiceTx } from "@/lib/chain/tx-builder";

// A stand-in Connection whose only used method is the rent-exempt lookup; the
// builder never sends, so no socket is opened.
const RENT_EXEMPT_MIN = 890_880;
function mockConnection() {
  return {
    getMinimumBalanceForRentExemption: vi.fn(async (space: number) => {
      expect(space).toBe(0);
      return RENT_EXEMPT_MIN;
    }),
  } as unknown as Connection;
}

describe("buildServiceTx (T-302)", () => {
  const sha256 = "a".repeat(64);
  const noticeToken = "https://eps.test/n/abc123";
  const serviceId = "rec_42";

  it("encodes sha256|notice|svc in a decodable memo instruction", async () => {
    const connection = mockConnection();
    const fromKeypair = Keypair.generate();
    const recipientPubkey = Keypair.generate().publicKey;

    const tx = await buildServiceTx({
      connection,
      fromKeypair,
      recipientPubkey,
      sha256,
      noticeToken,
      serviceId,
    });

    // Locate the memo instruction by its program id and decode the UTF-8 data.
    const memoIx = tx.instructions.find((ix) => ix.programId.equals(MEMO_PROGRAM_ID));
    expect(memoIx).toBeDefined();

    const decoded = Buffer.from(memoIx!.data).toString("utf8");
    const [field1, field2, field3] = decoded.split("|");

    expect(field1).toBe(sha256);
    expect(field2).toBe(noticeToken);
    expect(field3).toBe(serviceId);
    expect(decoded).toBe(`${sha256}|${noticeToken}|${serviceId}`);
  });

  it("transfers the rent-exempt minimum for a 0-data account", async () => {
    const connection = mockConnection();
    const fromKeypair = Keypair.generate();
    const recipientPubkey = Keypair.generate().publicKey;

    const tx = await buildServiceTx({
      connection,
      fromKeypair,
      recipientPubkey,
      sha256,
      noticeToken,
      serviceId,
    });

    expect(connection.getMinimumBalanceForRentExemption).toHaveBeenCalledWith(0);

    // Exactly two instructions: transfer + memo.
    expect(tx.instructions).toHaveLength(2);

    const transferIx = tx.instructions.find((ix) =>
      ix.programId.equals(SystemProgram.programId),
    );
    expect(transferIx).toBeDefined();

    const { lamports } = SystemInstruction.decodeTransfer(transferIx!);
    expect(Number(lamports)).toBe(RENT_EXEMPT_MIN);
    expect(tx.feePayer?.equals(fromKeypair.publicKey)).toBe(true);
  });

  it("rejects an off-curve (PDA-style) recipient before reading rent", async () => {
    const connection = mockConnection();
    // Derive an off-curve address (a PDA) that cannot hold a signable balance.
    const [pda] = PublicKey.findProgramAddressSync([Buffer.from("eps")], SystemProgram.programId);

    await expect(
      buildServiceTx({
        connection,
        fromKeypair: Keypair.generate(),
        recipientPubkey: pda,
        sha256,
        noticeToken,
        serviceId,
      }),
    ).rejects.toThrow(/off-curve/);

    expect(connection.getMinimumBalanceForRentExemption).not.toHaveBeenCalled();
  });
});
