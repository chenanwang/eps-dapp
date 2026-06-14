import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, UnauthorizedError } from "@/lib/auth";
import { prisma } from "@/lib/db";

/**
 * POST /api/demo/skip-payment — demo-only shortcut for live presentations
 * (issue #125, ETHGlobal). During a 5-minute demo, going through real Stripe
 * Checkout breaks the flow, so when `NEXT_PUBLIC_DEMO_MODE=true` this endpoint
 * lets a judge advance a freshly staged request past the payment gate without
 * entering card details.
 *
 * Data-model note: this repo has no `PAID` status and payment is metered at the
 * org-subscription level, not per request (see the detail-page note for issue
 * #113). The real lifecycle is `STAGED → IN_PROGRESS → CONFIRMED → FAILED`, so
 * "skip payment" advances the request **STAGED → IN_PROGRESS** ("Processing").
 * The fulfilment worker re-claims `IN_PROGRESS` rows and drives delivery to
 * `CONFIRMED`, so the full flow is demonstrable. We deliberately do NOT jump to
 * `CONFIRMED`: that status asserts a real on-chain proof + court-ready
 * certificate (hard rules #4/#6) which only the worker may stamp.
 *
 * Guards (in order):
 *   1. Demo mode must be enabled (`NEXT_PUBLIC_DEMO_MODE === "true"`) — 403
 *      otherwise, so this shortcut is inert in every non-demo environment.
 *   2. Auth is required; `userId`/`orgId` come from the verified Clerk session
 *      token, never the body (CLAUDE.md hard rule: auth on EVERY route).
 *   3. The request is ownership-scoped to the caller (their `userId`, or their
 *      active org) — a request belonging to another tenant resolves to 404,
 *      never another org's confidential filing.
 *
 * The status change + its `AuditLog` row are written in ONE `prisma.$transaction`
 * (hard rule #5: every state transition audits in the same transaction).
 *
 * Body: `{ "serviceId": string }`
 * Returns: `{ "id": string, "status": "IN_PROGRESS" }` on success.
 */

const SkipPaymentInput = z.object({
  serviceId: z.string().trim().min(1, "serviceId is required."),
});

function demoModeEnabled(): boolean {
  return process.env.NEXT_PUBLIC_DEMO_MODE === "true";
}

export async function POST(req: Request): Promise<Response> {
  // (1) Inert outside demo mode — never exposes a payment bypass in dev/staging
  //     /prod. Checked first so an unauthenticated probe learns nothing more
  //     than "disabled".
  if (!demoModeEnabled()) {
    return NextResponse.json(
      { error: "Demo mode is not enabled." },
      { status: 403 },
    );
  }

  // (2) Auth — the caller (and org, if any) come from the verified session token.
  let authContext;
  try {
    authContext = await requireUser();
  } catch (err) {
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

  const parsed = SkipPaymentInput.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: z.flattenError(parsed.error).fieldErrors },
      { status: 400 },
    );
  }
  const { serviceId } = parsed.data;

  // (3) Ownership scope: the caller's own request (by `userId`), or — when they
  //     have an active org — one owned by that org. Anything else is invisible.
  const ownership = {
    OR: [
      { userId: authContext.userId },
      ...(authContext.orgId
        ? [{ organization: { clerkOrgId: authContext.orgId } }]
        : []),
    ],
  };

  // Status change + audit row commit together (hard rule #5).
  const result = await prisma.$transaction(async (tx) => {
    const existing = await tx.serviceRequest.findFirst({
      where: { id: serviceId, ...ownership },
      select: { id: true, status: true },
    });
    if (!existing) {
      return { kind: "not_found" as const };
    }
    // Only a freshly STAGED request can have its payment skipped; anything
    // further along (already delivering, delivered, or failed) is left untouched.
    if (existing.status !== "STAGED") {
      return { kind: "wrong_state" as const, status: existing.status };
    }

    await tx.serviceRequest.update({
      where: { id: serviceId },
      data: { status: "IN_PROGRESS" },
    });

    await tx.auditLog.create({
      data: {
        action: "DEMO_PAYMENT_SKIPPED",
        actorId: authContext.userId,
        targetId: serviceId,
        metadata: {
          orgId: authContext.orgId,
          from: "STAGED",
          to: "IN_PROGRESS",
          demo: true,
        },
      },
    });

    return { kind: "ok" as const };
  });

  if (result.kind === "not_found") {
    return NextResponse.json({ error: "Service request not found." }, { status: 404 });
  }
  if (result.kind === "wrong_state") {
    return NextResponse.json(
      {
        error: `Cannot skip payment: request is ${result.status}, not STAGED.`,
      },
      { status: 409 },
    );
  }

  return NextResponse.json({ id: serviceId, status: "IN_PROGRESS" }, { status: 200 });
}
