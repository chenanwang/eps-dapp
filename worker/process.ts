import { getRentExemptMinimum, getSolanaAdapter } from "@/lib/chain";
import type { ClaimableRequest, WorkerDb } from "@/worker/index";

/**
 * Default delivery for one claimed service request (T-303 loop, T-304 contract).
 *
 * Persist-signature-before-confirm (CLAUDE.md hard rule #4): the chain delivery
 * is split into two halves so the signature is durable before we wait on
 * finalization.
 *
 *   1. If the claimed row has NO `txSignature` yet, this is a fresh attempt:
 *      send the rent-exempt transfer + Memo through the {@link ChainAdapter}
 *      seam, then IMMEDIATELY persist `txSignature` (the row stays IN_PROGRESS).
 *   2. Confirm at `finalized`, then read back the authoritative slot/blockTime
 *      and advance the row to CONFIRMED.
 *
 * Resume semantics (acceptance: "retry re-confirms, never re-sends"): if a
 * worker crashes after step 1 but before CONFIRMED, the row is left IN_PROGRESS
 * with `txSignature` set. The next `worker:once` re-claims it (single-worker
 * model resumes IN_PROGRESS rows) and, seeing the signature already on record,
 * SKIPS the send and goes straight to confirm — so a request is broadcast at
 * most once even across a crash/restart.
 *
 * The transfer amount is the cluster's rent-exempt minimum, so the recipient is
 * left with a durable, non-purgeable balance.
 *
 * Scope: T-305 adds post-confirm re-read verification (gating CONFIRMED vs
 * FAILED) and the memo's `sha256:` field; for now the memo carries the notice
 * token and service id. No caption or document bytes are logged or sent off-box
 * (hard rule #3).
 */
export async function processServiceRequest(
  row: ClaimableRequest,
  db: WorkerDb,
): Promise<void> {
  const adapter = getSolanaAdapter();

  let signature = row.txSignature;

  if (signature === null) {
    // Fresh attempt: build + send, then persist the signature BEFORE awaiting
    // confirmation (hard rule #4). The row stays IN_PROGRESS.
    const lamports = await getRentExemptMinimum();
    signature = await adapter.send({
      recipientWallet: row.recipientWallet,
      lamports,
      memoParts: [`notice:${row.noticeToken ?? ""}`, `svc:${row.id}`],
    });

    await db.serviceRequest.update({
      where: { id: row.id },
      data: { txSignature: signature },
    });
  }

  // Confirm at `finalized` (re-confirms on resume — never re-sends), then stamp
  // the authoritative slot/blockTime and advance to CONFIRMED.
  const { slot, blockTime } = await adapter.confirm(signature);

  await db.serviceRequest.update({
    where: { id: row.id },
    data: {
      status: "CONFIRMED",
      slot: BigInt(slot),
      blockTime: blockTime === null ? null : new Date(blockTime * 1000),
    },
  });
}
