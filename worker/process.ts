import { buildServiceMemo, getRentExemptMinimum, getSolanaAdapter } from "@/lib/chain";
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
 * Post-confirm re-read verification (T-305): the memo we send is the canonical
 * `${sha256}|${noticeToken}|${serviceId}` ({@link buildServiceMemo}). After
 * finalization we re-read the transaction's memo from the chain and compare it
 * to that expected value; on ANY mismatch the row is parked FAILED and an alert
 * is logged, so a delivery whose on-chain proof does not match what we intended
 * is never reported as CONFIRMED. No caption or document bytes are logged or
 * sent off-box (hard rule #3) — the memo carries only a hash and ids.
 */
export async function processServiceRequest(
  row: ClaimableRequest,
  db: WorkerDb,
): Promise<void> {
  const adapter = getSolanaAdapter();

  // The single source of truth for this delivery's memo — used both to send and
  // to verify on the re-read, so the two can never drift apart.
  const expectedMemo = buildServiceMemo({
    sha256: row.documentSha256 ?? "",
    noticeToken: row.noticeToken ?? "",
    serviceId: row.id,
  });

  let signature = row.txSignature;

  if (signature === null) {
    // Fresh attempt: build + send, then persist the signature BEFORE awaiting
    // confirmation (hard rule #4). The row stays IN_PROGRESS.
    const lamports = await getRentExemptMinimum();
    signature = await adapter.send({
      recipientWallet: row.recipientWallet,
      lamports,
      memoParts: [expectedMemo],
    });

    await db.serviceRequest.update({
      where: { id: row.id },
      data: { txSignature: signature },
    });
  }

  // Confirm at `finalized` (re-confirms on resume — never re-sends), then stamp
  // the authoritative slot/blockTime.
  const { slot, blockTime } = await adapter.confirm(signature);

  // Post-confirm re-read verification (T-305): re-read the on-chain memo and
  // compare it to what we intended to send. A mismatch means the finalized proof
  // does not match this request — park it FAILED and alert rather than claiming a
  // verified delivery. (Full failure handling — quota restore + dashboard
  // surface — is T-306.)
  const onChainMemo = await adapter.getMemo(signature);
  if (onChainMemo !== expectedMemo) {
    console.error(
      `[worker] memo verification FAILED for ${row.id} (sig ${signature}): ` +
        `expected "${expectedMemo}" but on-chain memo is "${onChainMemo ?? "<none>"}"`,
    );
    await db.serviceRequest.update({
      where: { id: row.id },
      data: { status: "FAILED" },
    });
    return;
  }

  await db.serviceRequest.update({
    where: { id: row.id },
    data: {
      status: "CONFIRMED",
      slot: BigInt(slot),
      blockTime: blockTime === null ? null : new Date(blockTime * 1000),
    },
  });
}
