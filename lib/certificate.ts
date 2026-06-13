import type { Prisma } from "@prisma/client";

/**
 * Certificate "First Viewed" addendum (T-402).
 *
 * The certificate PDF itself is generated later (T-403); this module records
 * the structured datum the certificate regenerates from: when the recipient
 * first opened the notice and the (masked) IP they viewed it from. It is
 * written in the SAME transaction as the first {@link NoticeAccess} row so the
 * proof-of-access trail and the certificate input never diverge.
 *
 * Only court-facing, non-confidential fields are stored here — a masked IP and
 * a timestamp. No document or caption bytes (CLAUDE.md hard rule #3).
 */

export interface FirstViewedAddendum {
  noticeId: string;
  /** When the recipient first viewed the notice (UTC). */
  viewedAt: Date;
  /** Recipient IP with the last octet masked (see `maskIp`). */
  viewerIp: string;
}

/**
 * Write the "First Viewed" certificate addendum for a notice.
 *
 * Idempotent at the schema level: `CertificateAddendum.noticeId` is unique, so
 * a notice has at most one addendum. Called only from inside the first-access
 * transaction in {@link recordFirstAccess}, hence the injected `tx` client.
 */
export async function writeFirstViewedAddendum(
  tx: Prisma.TransactionClient,
  addendum: FirstViewedAddendum,
): Promise<void> {
  await tx.certificateAddendum.create({
    data: {
      noticeId: addendum.noticeId,
      viewedAt: addendum.viewedAt,
      viewerIp: addendum.viewerIp,
    },
  });
}
