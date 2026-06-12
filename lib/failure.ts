import { prisma } from "@/lib/db";
import { restoreQuota } from "@/lib/quota";

/**
 * Terminal-failure handling for a service request (T-306).
 *
 * When a delivery fails terminally — a send error, an on-chain memo mismatch, or
 * a timeout after the retry budget is spent — three things must happen together,
 * atomically (CLAUDE.md hard rule #5: every state transition writes its audit row
 * in the SAME transaction):
 *
 *   1. The request is parked in `FAILED` with a human-readable `failureReason`
 *      the dashboard surfaces.
 *   2. The quota unit the request consumed at intake is restored — a failed
 *      delivery must never cost the customer a fulfilment.
 *   3. A `SERVICE_FAILED` `AuditLog` row records the transition.
 *
 * All three commit or none do: if the audit write fails the FAILED status and
 * the quota credit roll back, never leaving a half-applied failure.
 *
 * Like {@link createServiceRequest} (T-205), this uses the module-level `prisma`
 * so integration tests exercise the real transaction by mocking `@/lib/db`.
 */

/** Input describing the request that failed and why. */
export interface FailServiceRequestInput {
  /** `ServiceRequest.id` of the row that failed. */
  serviceRequestId: string;
  /** Internal `Organization.id` that owns the request (the persisted
   * `ServiceRequest.orgId`), used to credit the quota unit back. */
  orgId: string;
  /** Human-readable failure cause. Error/diagnostic text only — never document
   * or caption bytes (hard rule #3). Truncated for storage. */
  reason: string;
  /** On-chain signature, if one had been broadcast before the failure. */
  txSignature?: string | null;
}

/** Cap stored/audited reason text so a pathological error string can't bloat the row. */
const MAX_REASON_LEN = 500;

/** Synthetic actor for worker-driven transitions (no human performs them). */
const WORKER_ACTOR = "system:worker";

/**
 * Park a service request FAILED, restore its consumed quota unit, and audit the
 * transition — all in one transaction. See the module doc for the contract.
 *
 * @returns whether a quota unit was actually credited back (`false` if the org
 *   had no active subscription / the meter was already at zero).
 */
export async function failServiceRequest(
  input: FailServiceRequestInput,
): Promise<{ quotaRestored: boolean }> {
  const reason = input.reason.slice(0, MAX_REASON_LEN);

  return prisma.$transaction(async (tx) => {
    // (1) Mark the request terminally failed with the diagnostic reason.
    await tx.serviceRequest.update({
      where: { id: input.serviceRequestId },
      data: { status: "FAILED", failureReason: reason },
    });

    // (2) Give back the quota unit consumed at intake — a failed delivery must
    //     not be billed against the customer's period quota. Runs in the same tx
    //     so it rolls back with the rest if the audit write below fails.
    const quotaRestored = await restoreQuota(input.orgId, tx);

    // (3) Audit the transition in the SAME tx (hard rule #5). Metadata carries
    //     only ids/refs and the diagnostic reason — never document bytes.
    await tx.auditLog.create({
      data: {
        action: "SERVICE_FAILED",
        actorId: WORKER_ACTOR,
        targetId: input.serviceRequestId,
        metadata: {
          orgId: input.orgId,
          reason,
          quotaRestored,
          ...(input.txSignature ? { txSignature: input.txSignature } : {}),
        },
      },
    });

    return { quotaRestored };
  });
}
