import { prisma } from "@/lib/db";
import { writeFirstViewedAddendum } from "@/lib/certificate";
import { sendFirstAccessAlert } from "./email/send-first-access-alert";

/**
 * First-access recording for public notices (T-402).
 *
 * The first time a recipient opens `/n/<token>`, we record one
 * {@link NoticeAccess} row, write the certificate "First Viewed" addendum, and
 * audit the transition — all in ONE transaction (hard rule #5). The
 * `NoticeAccess.noticeId` unique constraint makes this idempotent: subsequent
 * views find the existing row and return `isFirstAccess: false` without writing.
 */

export interface FirstAccessResult {
  /** True only on the very first recorded view of this notice. */
  isFirstAccess: boolean;
  /** Service-owner email for the alert, when the org has one (else null). */
  ownerEmail: string | null;
  /** Case caption, used as the email subject reference. */
  caseRef: string;
  /** Recipient IP with the last octet masked (for email + certificate). */
  maskedIp: string;
  /** Timestamp of the first view (UTC). On repeat views, the original time. */
  viewedAt: Date;
}

/**
 * Mask the last octet of an IPv4 address (`203.0.113.42` → `203.0.113.x`) or
 * the final group of an IPv6 address. Anything else is returned unchanged. Used
 * for the certificate addendum and the alert email; the full IP is retained
 * only in the `NoticeAccess` row.
 */
export function maskIp(ip: string): string {
  const v4 = ip.split(".");
  if (v4.length === 4 && v4.every((p) => /^\d+$/.test(p))) {
    v4[3] = "x";
    return v4.join(".");
  }
  if (ip.includes(":")) {
    const groups = ip.split(":");
    groups[groups.length - 1] = "x";
    return groups.join(":");
  }
  return ip;
}

/**
 * Record the first access to a notice, idempotently.
 *
 * On the first call for `noticeId` this inserts the access row, writes the
 * certificate addendum, and writes an audit row, then returns
 * `isFirstAccess: true`. On every later call it short-circuits and returns
 * `isFirstAccess: false` with the original view time. The audit/addendum store
 * only a MASKED ip and never the caption (hard rule #3).
 */
export async function recordFirstAccess(
  noticeId: string,
  ip: string,
  userAgent: string,
): Promise<FirstAccessResult> {
  const maskedIp = maskIp(ip);

  return prisma.$transaction(async (tx) => {
    const service = await tx.serviceRequest.findUnique({
      where: { id: noticeId },
      select: {
        caseCaption: true,
        organization: { select: { ownerEmail: true } },
        access: { select: { accessedAt: true } },
      },
    });

    const ownerEmail = service?.organization.ownerEmail ?? null;
    const caseRef = service?.caseCaption ?? "";

    // Already viewed: no-op, report the original time.
    if (service?.access) {
      return {
        isFirstAccess: false,
        ownerEmail,
        caseRef,
        maskedIp,
        viewedAt: service.access.accessedAt,
      };
    }

    const access = await tx.noticeAccess.create({
      data: { noticeId, ip, userAgent },
      select: { accessedAt: true },
    });

    await writeFirstViewedAddendum(tx, {
      noticeId,
      viewedAt: access.accessedAt,
      viewerIp: maskedIp,
    });

    await tx.auditLog.create({
      data: {
        action: "NOTICE_FIRST_ACCESSED",
        // Public, unauthenticated view — no Clerk actor.
        actorId: "public",
        targetId: noticeId,
        // Masked ip only; never the caption/document (hard rule #3).
        metadata: { viewerIp: maskedIp },
      },
    });

    // Fire-and-forget first-access alert email (T-404).
    void sendFirstAccessAlert(noticeId);

    return {
      isFirstAccess: true,
      ownerEmail,
      caseRef,
      maskedIp,
      viewedAt: access.accessedAt,
    };
  });
}
