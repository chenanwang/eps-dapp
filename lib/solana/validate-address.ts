import { PublicKey } from "@solana/web3.js";

/**
 * Thrown when a recipient address is not a valid Solana wallet that can sign
 * for / hold rent-exempt transfers.
 *
 * Two distinct failure modes are distinguished by {@link InvalidRecipientError.reason}:
 *  - `"malformed"` — the string is not a valid base58-encoded 32-byte public key.
 *  - `"off-curve"` — the key is well-formed but does NOT lie on the ed25519 curve
 *    (e.g. a Program Derived Address). A PDA has no private key, so funds sent to
 *    it can never be moved by a signer — never a valid service recipient.
 */
export class InvalidRecipientError extends Error {
  constructor(
    public readonly address: string,
    public readonly reason: "malformed" | "off-curve",
  ) {
    super(
      reason === "off-curve"
        ? `Invalid recipient address '${address}': key is off-curve (e.g. a Program Derived Address) and cannot hold a signable balance.`
        : `Invalid recipient address '${address}': not a valid base58-encoded Solana public key.`,
    );
    this.name = "InvalidRecipientError";
  }
}

/**
 * Assert that `addr` is a valid Solana recipient wallet: a well-formed base58
 * public key that lies on the ed25519 curve (i.e. a real account that can hold
 * and later move a signable balance — not a PDA / off-curve address).
 *
 * @param addr base58-encoded address string to validate.
 * @returns the parsed, on-curve {@link PublicKey}.
 * @throws {InvalidRecipientError} if `addr` is malformed or off-curve.
 */
export function assertValidRecipient(addr: string): PublicKey {
  let pubkey: PublicKey;
  try {
    pubkey = new PublicKey(addr);
  } catch {
    throw new InvalidRecipientError(addr, "malformed");
  }

  if (!PublicKey.isOnCurve(pubkey.toBytes())) {
    throw new InvalidRecipientError(addr, "off-curve");
  }

  return pubkey;
}
