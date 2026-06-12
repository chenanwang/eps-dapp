import { NextResponse } from "next/server";
import {
  requireOrgAdmin,
  UnauthorizedError,
  ForbiddenError,
} from "@/lib/auth";
import { prisma } from "@/lib/db";

/** Tier and term of a Founders Legacy comp grant. */
const COMP_GRANT_TIER = "tier3";
const COMP_GRANT_MONTHS = 24;
const COMP_GRANT_LABEL = "Founders Legacy";

/** Return a Date `months` calendar months after `from`. */
function addMonths(from: Date, months: number): Date {
  const out = new Date(from);
  out.setMonth(out.getMonth() + months);
  return out;
}

/**
 * POST /api/admin/comp-grant — grant a complimentary Tier3 subscription
 * ("Founders Legacy", 24 months) to an organization.
 *
 * Admin-only: the caller must hold the `org:admin` role in their active Clerk
 * org (verified server-side from the session token). Non-admins get 403.
 *
 * Body: `{ "targetOrgId": string }` — the Clerk org id to grant the comp to.
 *
 * The grant upserts the target {@link Organization} (by `clerkOrgId`) and its
 * {@link Subscription} to Tier3/ACTIVE with a 24-month period, and writes an
 * {@link AuditLog} row — all in one DB transaction (CLAUDE.md hard rule #5).
 */
export async function POST(req: Request): Promise<Response> {
  let actor;
  try {
    actor = await requireOrgAdmin();
  } catch (err) {
    if (err instanceof ForbiddenError) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    throw err;
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const targetOrgId = (body as { targetOrgId?: unknown } | null)?.targetOrgId;
  if (typeof targetOrgId !== "string" || targetOrgId.length === 0) {
    return NextResponse.json(
      { error: "Invalid targetOrgId. Expected a non-empty string." },
      { status: 400 },
    );
  }

  const now = new Date();
  const periodEnd = addMonths(now, COMP_GRANT_MONTHS);

  const subscription = await prisma.$transaction(async (tx) => {
    const org = await tx.organization.upsert({
      where: { clerkOrgId: targetOrgId },
      create: { clerkOrgId: targetOrgId, name: targetOrgId },
      update: {},
    });

    // Subscription has no natural unique key beyond `id`, so reconcile the
    // org's existing subscription (if any) rather than relying on upsert.
    const existing = await tx.subscription.findFirst({
      where: { orgId: org.id },
      orderBy: { periodEnd: "desc" },
    });

    const sub = existing
      ? await tx.subscription.update({
          where: { id: existing.id },
          data: {
            tierId: COMP_GRANT_TIER,
            status: "ACTIVE",
            periodStart: now,
            periodEnd,
            usageCount: 0,
          },
        })
      : await tx.subscription.create({
          data: {
            orgId: org.id,
            tierId: COMP_GRANT_TIER,
            status: "ACTIVE",
            periodStart: now,
            periodEnd,
          },
        });

    await tx.auditLog.create({
      data: {
        action: "COMP_GRANT",
        actorId: actor.userId,
        targetId: targetOrgId,
        metadata: {
          grant: COMP_GRANT_LABEL,
          tier: COMP_GRANT_TIER,
          months: COMP_GRANT_MONTHS,
          subscriptionId: sub.id,
          actorOrgId: actor.orgId,
        },
      },
    });

    return sub;
  });

  return NextResponse.json(
    {
      ok: true,
      grant: COMP_GRANT_LABEL,
      subscription: {
        id: subscription.id,
        tierId: subscription.tierId,
        status: subscription.status,
        periodEnd: subscription.periodEnd.toISOString(),
      },
    },
    { status: 200 },
  );
}
