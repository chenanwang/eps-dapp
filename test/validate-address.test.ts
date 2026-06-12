import { Keypair, PublicKey } from "@solana/web3.js";
import { describe, expect, it } from "vitest";

import { assertValidRecipient, InvalidRecipientError } from "@/lib/solana/validate-address";

describe("assertValidRecipient", () => {
  it("accepts a valid on-curve wallet and returns its PublicKey", () => {
    const wallet = Keypair.generate().publicKey;

    const result = assertValidRecipient(wallet.toBase58());

    expect(result).toBeInstanceOf(PublicKey);
    expect(result.equals(wallet)).toBe(true);
  });

  it("rejects a Program Derived Address (off-curve) with reason 'off-curve'", () => {
    // Derive a PDA — by construction it lies OFF the ed25519 curve, so it has
    // no private key and can never be a signable recipient.
    const [pda] = PublicKey.findProgramAddressSync(
      [Buffer.from("eps-test-seed")],
      new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"),
    );
    expect(PublicKey.isOnCurve(pda.toBytes())).toBe(false);

    expect(() => assertValidRecipient(pda.toBase58())).toThrow(InvalidRecipientError);
    try {
      assertValidRecipient(pda.toBase58());
      expect.unreachable("expected off-curve PDA to be rejected");
    } catch (err) {
      expect(err).toBeInstanceOf(InvalidRecipientError);
      expect((err as InvalidRecipientError).reason).toBe("off-curve");
    }
  });

  it("rejects a random non-base58 string with reason 'malformed'", () => {
    try {
      assertValidRecipient("not-a-real-solana-address!!!");
      expect.unreachable("expected malformed string to be rejected");
    } catch (err) {
      expect(err).toBeInstanceOf(InvalidRecipientError);
      expect((err as InvalidRecipientError).reason).toBe("malformed");
    }
  });

  it("rejects an empty string", () => {
    expect(() => assertValidRecipient("")).toThrow(InvalidRecipientError);
  });

  it("rejects a base58 string of the wrong length", () => {
    // Valid base58 characters but far too short to decode to a 32-byte key.
    expect(() => assertValidRecipient("abc")).toThrow(InvalidRecipientError);
  });
});
