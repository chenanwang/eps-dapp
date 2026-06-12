import type { PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { Tier } from "@/lib/stripe";

/**
 * The subset of Prisma's client this module needs. Both the top-level
 * `PrismaClient` and an interactive-transaction client (`tx` inside
 * `prisma.$transaction`) satisfy it, so quota can be consumed standalone or as
 * part of a larger atomic unit of work (see `lib/intake.ts`).
 */
export type QuotaDbClient = Pick<PrismaClient, "subscription">;

/**
 * Per-period quota (number of fulfilments allowed) for each subscription tier.
 * Keyed by the `tierId` stored on `Subscription` — the same `tier1|tier2|tier3`
 * wire values the checkout route stamps onto the Stripe session metadata.
 */
export const TIER_QUOTA: Record<Tier, number> = {
  tier1: 1,
  tier2: 9,
  tier3: 999,
};

/** Thrown when an org has consumed its full quota for the current period. */
export class QuotaExceededError extends Error {
  constructor(
    public readonly orgId: string,
    public readonly limit: number,
  ) {
    super(`Quota exceeded: org ${orgId} has used all ${limit} fulfilments for this period.`);
    this.name = "QuotaExceededError";
  }
}

/** Thrown when an org has no ACTIVE subscription to meter against. */
export class NoActiveSubscriptionError extends Error {
  constructor(public readonly orgId: string) {
    super(`No active subscription for org ${orgId}.`);
    this.name = "NoActiveSubscriptionError";
  }
}

/** Result of a successful quota consumption. */
export interface QuotaResult {
  /** Subscription's `usageCount` after this consumption. */
  usageCount: number;
  /** The tier limit that was enforced. */
  limit: number;
}

/** Advance a period-end one calendar month past `from` (matches the webhook upsert). */
function nextPeriodEnd(from: Date): Date {
  const end = new Date(from);
  end.setMonth(end.getMonth() + 1);
  return end;
}

/**
 * Consume one unit of quota for an organization, enforcing its tier limit.
 *
 * `orgId` is the Clerk org id (the verified `orgId` from the session token —
 * never client-supplied). The org's ACTIVE subscription is metered:
 *
 *  - If the current period has elapsed (`now > periodEnd`), the meter rolls over:
 *    `usageCount` resets to 0 and a fresh period begins, so this call counts as
 *    the first unit of the new period.
 *  - Otherwise the increment is applied atomically with a guard
 *    (`usageCount < limit`), so concurrent callers can never push usage past the
 *    tier limit. If the limit is already reached, {@link QuotaExceededError} is
 *    thrown and nothing is mutated.
 *
 * Pass a transaction client as `db` to consume quota inside a larger
 * `prisma.$transaction` — the decrement then rolls back with the rest of the
 * unit of work if any later step fails (see `lib/intake.ts`, T-205). Defaults
 * to the shared `prisma` client when called standalone.
 *
 * @throws {NoActiveSubscriptionError} if the org has no ACTIVE subscription.
 * @throws {QuotaExceededError} if the period's quota is exhausted.
 */
export async function checkAndDecrementQuota(
  orgId: string,
  db: QuotaDbClient = prisma,
): Promise<QuotaResult> {
  const subscription = await db.subscription.findFirst({
    where: { status: "ACTIVE", organization: { clerkOrgId: orgId } },
    orderBy: { periodEnd: "desc" },
  });

  if (!subscription) {
    throw new NoActiveSubscriptionError(orgId);
  }

  const limit = TIER_QUOTA[subscription.tierId as Tier];
  if (limit === undefined) {
    throw new Error(`Unknown subscription tier '${subscription.tierId}' for org ${orgId}.`);
  }

  const now = new Date();

  // Period rollover: the elapsed period's meter resets to 0, and this call is
  // the first unit of the new period (usageCount -> 1).
  if (now > subscription.periodEnd) {
    await db.subscription.update({
      where: { id: subscription.id },
      data: { usageCount: 1, periodStart: now, periodEnd: nextPeriodEnd(now) },
    });
    return { usageCount: 1, limit };
  }

  // Atomic conditional increment: only succeeds while under the limit. The
  // `where` guard makes this safe against concurrent consumers — at most `limit`
  // increments can ever win.
  const { count } = await db.subscription.updateMany({
    where: { id: subscription.id, usageCount: { lt: limit } },
    data: { usageCount: { increment: 1 } },
  });

  if (count === 0) {
    throw new QuotaExceededError(orgId, limit);
  }

  return { usageCount: subscription.usageCount + 1, limit };
}

/**
 * Restore one unit of quota to an organization — the inverse of
 * {@link checkAndDecrementQuota}. Used when a service request that already
 * consumed a unit at intake fails terminally (T-306): a failed delivery must
 * not cost the customer a fulfilment, so the consumed unit is given back.
 *
 * `orgId` here is the INTERNAL `Organization.id` (the `Subscription.orgId` FK),
 * which the worker reads straight off the persisted `ServiceRequest.orgId` — no
 * Clerk-id join needed. (Intake's {@link checkAndDecrementQuota} keys on the
 * Clerk org id instead because that is what the verified session token carries;
 * both resolve to the same subscription.)
 *
 * `usageCount` counts units consumed this period, so giving a unit back means
 * DECREMENTing it. The decrement is atomic and guarded (`usageCount > 0`) so it
 * can never push the meter below zero, and it targets the org's ACTIVE
 * subscription (latest period first), mirroring how the unit was consumed.
 *
 * Restore is best-effort and never throws: if the org has no ACTIVE
 * subscription (e.g. canceled since intake) there is nothing to credit, so it
 * is a no-op. Pass a transaction client as `db` to restore inside a larger
 * `prisma.$transaction` (see {@link failServiceRequest}).
 *
 * @returns `true` if a unit was credited back, `false` if there was nothing to
 *   restore (no active subscription, or the meter was already at zero).
 */
export async function restoreQuota(
  orgId: string,
  db: QuotaDbClient = prisma,
): Promise<boolean> {
  const subscription = await db.subscription.findFirst({
    where: { status: "ACTIVE", orgId },
    orderBy: { periodEnd: "desc" },
  });

  if (!subscription) {
    return false;
  }

  // Atomic, floored credit: only decrements while the meter is above zero, so
  // a double-restore (or a restore against a fresh period) can never underflow.
  const { count } = await db.subscription.updateMany({
    where: { id: subscription.id, usageCount: { gt: 0 } },
    data: { usageCount: { decrement: 1 } },
  });

  return count > 0;
}
