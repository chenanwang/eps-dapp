import { MEMO_PROGRAM_ID, createMemoInstruction } from "@solana/spl-memo";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";
import bs58 from "bs58";

import { assertValidRecipient } from "@/lib/solana/validate-address";
import type {
  ChainAdapter,
  ChainDeliveryResult,
  ConfirmationResult,
  DeliverParams,
} from "@/lib/chain/types";

/**
 * Reject any RPC endpoint that targets Solana mainnet-beta (CLAUDE.md hard
 * rule #2). The check is a substring match on the URL ("mainnet") —
 * deliberately broad so neither the public `api.mainnet-beta.solana.com` nor a
 * private mainnet RPC slips through. Shared by the adapter constructor and the
 * standalone reads below so every web3.js handle in this module is guarded.
 * @throws {Error} `"Mainnet RPC forbidden"` if the URL targets mainnet.
 */
function assertNotMainnetUrl(rpcUrl: string): void {
  if (rpcUrl.toLowerCase().includes("mainnet")) {
    throw new Error("Mainnet RPC forbidden");
  }
}

/**
 * Decode the Memo instruction data from a `getTransaction` response (T-305).
 *
 * Handles both the legacy `Message` shape (`accountKeys` + `instructions` whose
 * `data` is base58) and the v0 `MessageV0` shape (`staticAccountKeys` +
 * `compiledInstructions` whose `data` is a byte array). It locates the
 * instruction whose program is the Memo program and UTF-8 decodes its data.
 * @returns the memo string, or `null` if the tx is missing or carries no memo.
 */
function decodeMemo(
  tx: { transaction?: { message?: unknown } } | null,
): string | null {
  const message = tx?.transaction?.message;
  if (!message) return null;

  const m = message as {
    accountKeys?: PublicKey[];
    staticAccountKeys?: PublicKey[];
    instructions?: { programIdIndex: number; data: string }[];
    compiledInstructions?: { programIdIndex: number; data: Uint8Array }[];
  };

  const accountKeys = m.accountKeys ?? m.staticAccountKeys;
  if (!accountKeys) return null;

  const isMemo = (programIdIndex: number): boolean =>
    accountKeys[programIdIndex]?.equals(MEMO_PROGRAM_ID) ?? false;

  if (m.instructions) {
    for (const ix of m.instructions) {
      if (isMemo(ix.programIdIndex)) {
        return Buffer.from(bs58.decode(ix.data)).toString("utf8");
      }
    }
  }
  if (m.compiledInstructions) {
    for (const ix of m.compiledInstructions) {
      if (isMemo(ix.programIdIndex)) {
        return Buffer.from(ix.data).toString("utf8");
      }
    }
  }
  return null;
}

/**
 * Solana implementation of {@link ChainAdapter} (T-301).
 *
 * The v1 anchor delivery is `SystemProgram.transfer(rent-exempt min)` plus a
 * Memo, sent and confirmed at `finalized`. This is the only module that imports
 * `@solana/web3.js`; everything else goes through the {@link ChainAdapter}
 * interface.
 *
 * Mainnet guard (CLAUDE.md hard rule #2): {@link assertNotMainnet} runs in the
 * constructor, so an adapter pointed at mainnet-beta can never be built.
 */
export class SolanaAdapter implements ChainAdapter {
  private readonly connection: Connection;

  constructor(
    private readonly rpcUrl: string,
    private readonly signer: Keypair,
  ) {
    // Fail loud before any network handle is opened.
    this.assertNotMainnet();
    this.connection = new Connection(rpcUrl, "finalized");
  }

  /**
   * Reject any RPC endpoint that targets Solana mainnet-beta. The check is a
   * substring match on the URL ("mainnet") — deliberately broad so neither the
   * public `api.mainnet-beta.solana.com` nor a private mainnet RPC slips
   * through.
   * @throws {Error} `"Mainnet RPC forbidden"` if the URL targets mainnet.
   */
  assertNotMainnet(): void {
    assertNotMainnetUrl(this.rpcUrl);
  }

  /**
   * Build, sign, and send the transfer + memo transaction WITHOUT awaiting
   * confirmation, returning the signature so the caller can persist it before
   * confirming (hard rule #4). `Connection.sendTransaction` populates a recent
   * blockhash and the fee payer before broadcasting.
   */
  async send(params: DeliverParams): Promise<string> {
    // Never send to an off-curve / malformed address (a PDA can't hold a
    // signable balance, so funds would be unrecoverable).
    const recipient = assertValidRecipient(params.recipientWallet);

    const tx = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: this.signer.publicKey,
        toPubkey: recipient,
        lamports: params.lamports,
      }),
      createMemoInstruction(params.memoParts.join(" | "), [this.signer.publicKey]),
    );

    return this.connection.sendTransaction(tx, [this.signer]);
  }

  /**
   * Poll the cluster until `signature` is `finalized`, then re-read the tx for
   * the authoritative slot / blockTime. Confirmation is keyed on the signature
   * alone, so a worker resumed in a fresh process (which no longer holds the
   * original blockhash) can still confirm a tx an earlier process sent.
   */
  async confirm(signature: string): Promise<ConfirmationResult> {
    await this.connection.confirmTransaction(signature, "finalized");

    const confirmed = await this.connection.getTransaction(signature, {
      commitment: "finalized",
      maxSupportedTransactionVersion: 0,
    });

    return {
      slot: confirmed?.slot ?? 0,
      blockTime: confirmed?.blockTime ?? null,
    };
  }

  /**
   * Re-read the finalized transaction and decode its Memo instruction (T-305).
   * Keyed on the signature alone, so the worker can verify a tx that an earlier
   * process sent.
   */
  async getMemo(signature: string): Promise<string | null> {
    const tx = await this.connection.getTransaction(signature, {
      commitment: "finalized",
      maxSupportedTransactionVersion: 0,
    });
    return decodeMemo(tx);
  }

  /**
   * Convenience composition of {@link send} + {@link confirm}. The worker uses
   * the two halves directly so it can persist the signature between them
   * (hard rule #4); this is kept for callers that don't need that guarantee.
   */
  async deliver(params: DeliverParams): Promise<ChainDeliveryResult> {
    const signature = await this.send(params);
    const confirmation = await this.confirm(signature);
    return { signature, ...confirmation };
  }
}

/**
 * Build a {@link SolanaAdapter} from the environment:
 *  - `SOLANA_RPC_URL` — cluster RPC endpoint (never mainnet; guarded).
 *  - `SOLANA_SIGNER_KEYPAIR` — the app wallet secret key, base58-encoded.
 *
 * Fails loud if either is missing — no weak fallback (CLAUDE.md). The signer
 * secret comes from the environment only; it is never logged or persisted
 * (hard rule #1).
 */
export function getSolanaAdapter(): SolanaAdapter {
  const rpcUrl = process.env.SOLANA_RPC_URL;
  if (!rpcUrl) {
    throw new Error("SOLANA_RPC_URL is not set");
  }

  const secretBase58 = process.env.SOLANA_SIGNER_KEYPAIR;
  if (!secretBase58) {
    throw new Error("SOLANA_SIGNER_KEYPAIR is not set");
  }

  const signer = Keypair.fromSecretKey(bs58.decode(secretBase58));
  return new SolanaAdapter(rpcUrl, signer);
}

/**
 * Read the rent-exempt minimum (lamports) for a zero-data account from the
 * configured cluster — the v1 anchor transfer amount (see T-302). Kept in this
 * module so the worker can size the transfer without importing `@solana/web3.js`
 * directly (CLAUDE.md: "all chain calls behind lib/chain"); the mainnet guard
 * runs before any connection is opened (hard rule #2).
 */
export async function getRentExemptMinimum(): Promise<bigint> {
  const rpcUrl = process.env.SOLANA_RPC_URL;
  if (!rpcUrl) {
    throw new Error("SOLANA_RPC_URL is not set");
  }
  assertNotMainnetUrl(rpcUrl);

  const connection = new Connection(rpcUrl, "finalized");
  return BigInt(await connection.getMinimumBalanceForRentExemption(0));
}
