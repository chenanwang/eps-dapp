/**
 * Chain delivery abstraction (T-301).
 *
 * Every on-chain interaction goes through a {@link ChainAdapter} so the rest of
 * the app never talks to a concrete RPC/SDK directly (CLAUDE.md: "all chain
 * calls behind lib/chain"). This keeps the v1 anchor (SystemProgram.transfer +
 * Memo) and the planned v1.5 Token-2022 service NFT behind one seam, and gives
 * a single chokepoint for the mainnet guard (hard rule #2).
 */

/** The finalized-block coordinates of a confirmed transaction. */
export interface ConfirmationResult {
  /** Slot the transaction landed in. */
  slot: number;
  /** Unix timestamp (seconds) of the block, or `null` if the cluster has none. */
  blockTime: number | null;
}

/** Result of a confirmed on-chain delivery. */
export interface ChainDeliveryResult extends ConfirmationResult {
  /** Transaction signature (base58). Persist this BEFORE confirming (rule #4). */
  signature: string;
}

/** Parameters for a single service delivery transaction. */
export interface DeliverParams {
  /** On-curve base58 recipient wallet (the defendant's address). */
  recipientWallet: string;
  /** Lamports to transfer (the rent-exempt minimum for the v1 anchor). */
  lamports: bigint;
  /**
   * Memo fields, joined into the on-chain memo. Per the SOW the v1 anchor memo
   * carries `sha256:<hash>`, `notice:<short-url>`, `svc:<recordId>`.
   */
  memoParts: string[];
}

/**
 * Abstraction over the chain used for service delivery. The concrete
 * implementation ({@link "./solana".SolanaAdapter}) is the only code that
 * touches `@solana/web3.js`.
 */
export interface ChainAdapter {
  /**
   * Throw if this adapter is pointed at Solana mainnet-beta. Called in the
   * constructor and safe to call again at the start of any delivery.
   * @throws {Error} `"Mainnet RPC forbidden"` when the RPC URL targets mainnet.
   */
  assertNotMainnet(): void;

  /**
   * Build, sign, and send a transfer + memo transaction WITHOUT waiting for
   * confirmation, returning the signature immediately.
   *
   * This is the first half of delivery, split out so the caller can persist the
   * signature to the DB BEFORE confirming (hard rule #4). A worker that crashes
   * after {@link send} but before {@link confirm} thus has the signature on
   * record and resumes by re-confirming — never re-sending.
   * @returns the transaction signature (base58).
   */
  send(params: DeliverParams): Promise<string>;

  /**
   * Confirm a previously-{@link send}-ed transaction at `finalized`, then read
   * back its slot/blockTime. Safe to call on a signature from an earlier process
   * (a resumed worker), since it polls the cluster by signature alone.
   * @returns the finalized slot and block time.
   */
  confirm(signature: string): Promise<ConfirmationResult>;

  /**
   * Convenience: {@link send} then {@link confirm} a transfer + memo transaction.
   * Prefer the split {@link send}/{@link confirm} in the worker so the signature
   * can be persisted between the two halves (hard rule #4).
   * @returns the signature plus the slot/blockTime it confirmed in.
   */
  deliver(params: DeliverParams): Promise<ChainDeliveryResult>;
}
