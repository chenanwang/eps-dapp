import { createMemoInstruction } from "@solana/spl-memo";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";

/**
 * Service-delivery transaction builder (T-302).
 *
 * Builds — but does NOT send — the v1 on-chain anchor for a single service:
 *
 *  1. `SystemProgram.transfer` of the rent-exempt minimum for a zero-data
 *     account (`getMinimumBalanceForRentExemption(0)`). This is the smallest
 *     lamport amount that leaves the recipient with a non-purgeable balance, so
 *     the delivery leaves a durable, self-funded marker on-chain.
 *  2. A Memo (`@solana/spl-memo`) carrying the tamper-evident proof fields
 *     joined as `${sha256}|${noticeToken}|${serviceId}` — the document hash, the
 *     short notice token, and the internal service-record id.
 *
 * Sending/confirming (persist-sig-before-confirm at `finalized`, hard rule #4)
 * is the worker's job (T-303); this module is pure transaction assembly so it
 * can be unit-tested without a live cluster.
 */

/** The tamper-evident proof fields carried in the on-chain service memo. */
export interface ServiceMemoFields {
  /** SHA-256 hex digest of the served document. */
  sha256: string;
  /** Short notice token / URL slug for the recipient to retrieve the notice. */
  noticeToken: string;
  /** Internal service-record id (`svc`). */
  serviceId: string;
}

/**
 * Canonical on-chain memo string for a service delivery:
 * `${sha256}|${noticeToken}|${serviceId}`. This is the single source of truth
 * for the memo format — the worker uses it both to build the memo it sends and
 * to compute the expected value it compares against on the post-confirm re-read
 * (T-305), so the two can never drift apart.
 */
export function buildServiceMemo({
  sha256,
  noticeToken,
  serviceId,
}: ServiceMemoFields): string {
  return `${sha256}|${noticeToken}|${serviceId}`;
}

/** Inputs for {@link buildServiceTx}. */
export interface BuildServiceTxParams {
  /**
   * RPC handle used only to read the rent-exempt minimum. No signing or
   * sending happens here (never pointed at mainnet — guarded in the adapter).
   */
  connection: Connection;
  /** App wallet that funds and signs the transfer; also the fee payer. */
  fromKeypair: Keypair;
  /** Recipient (defendant) wallet. Must be on-curve — a PDA cannot hold funds. */
  recipientPubkey: PublicKey;
  /** SHA-256 hex digest of the served document. */
  sha256: string;
  /** Short notice token / URL slug for the recipient to retrieve the notice. */
  noticeToken: string;
  /** Internal service-record id (`svc`). */
  serviceId: string;
}

/**
 * Build the unsigned service-delivery transaction: a rent-exempt transfer plus
 * a Memo encoding `${sha256}|${noticeToken}|${serviceId}`.
 *
 * @returns a {@link Transaction} with `feePayer` set to the app wallet, ready to
 *   have a recent blockhash attached and be signed/sent by the worker.
 * @throws if `recipientPubkey` is off-curve (e.g. a Program Derived Address),
 *   since funds sent there could never be moved.
 */
export async function buildServiceTx({
  connection,
  fromKeypair,
  recipientPubkey,
  sha256,
  noticeToken,
  serviceId,
}: BuildServiceTxParams): Promise<Transaction> {
  // Refuse off-curve recipients (PDAs have no signer and could never reclaim
  // the lamports) — same invariant the adapter enforces before sending.
  if (!PublicKey.isOnCurve(recipientPubkey.toBytes())) {
    throw new Error(
      `Invalid recipient '${recipientPubkey.toBase58()}': key is off-curve (e.g. a PDA) and cannot hold a signable balance.`,
    );
  }

  // Smallest balance that keeps a zero-data account rent-exempt.
  const lamports = await connection.getMinimumBalanceForRentExemption(0);

  const memo = buildServiceMemo({ sha256, noticeToken, serviceId });

  const tx = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: fromKeypair.publicKey,
      toPubkey: recipientPubkey,
      lamports,
    }),
    createMemoInstruction(memo, [fromKeypair.publicKey]),
  );
  tx.feePayer = fromKeypair.publicKey;

  return tx;
}
