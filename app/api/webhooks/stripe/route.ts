import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getStripe } from "@/lib/stripe";

// Stripe signature verification needs the exact raw request bytes, so this route
// must never run on a cached/static response.
export const dynamic = "force-dynamic";

/**
 * POST /api/webhooks/stripe — receive Stripe Billing webhooks.
 *
 * Security & correctness contract (CLAUDE.md hard rule + P1/T-104 gate):
 *   1. The `Stripe-Signature` header is verified against STRIPE_WEBHOOK_SECRET
 *      using the *raw* request body. An invalid/absent signature → 400, nothing
 *      is written.
 *   2. Every accepted event is recorded in `WebhookEvent` (keyed by the Stripe
 *      event id) inside the SAME transaction that applies its side effects. A
 *      replayed event hits the `eventId` unique constraint, the transaction
 *      rolls back, and the handler returns 200 as a no-op — no second DB write.
 *   3. On `checkout.session.completed` the org's `Subscription` is upserted to
 *      ACTIVE (keyed by the Stripe subscription id, so it is itself idempotent).
 */
export async function POST(req: Request): Promise<Response> {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    // Misconfiguration, not a client error: fail loudly rather than silently
    // accepting unverifiable events.
    return NextResponse.json(
      { error: "STRIPE_WEBHOOK_SECRET is not set." },
      { status: 500 },
    );
  }

  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing Stripe-Signature header" }, { status: 400 });
  }

  // Raw body bytes are required for signature verification — do not JSON.parse first.
  const payload = await req.text();

  const stripe = getStripe();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(payload, signature, secret);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid signature";
    return NextResponse.json({ error: `Signature verification failed: ${message}` }, { status: 400 });
  }

  try {
    await prisma.$transaction(async (tx) => {
      // Dedupe guard: first writer for this event id wins. A replay throws P2002
      // here and rolls back the whole transaction (no side effects applied).
      await tx.webhookEvent.create({ data: { eventId: event.id } });

      if (event.type === "checkout.session.completed") {
        await applyCheckoutCompleted(tx, event.data.object);
      }
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      // Already processed — idempotent no-op (T-104 acceptance criterion).
      return NextResponse.json({ received: true, deduped: true });
    }
    throw err;
  }

  return NextResponse.json({ received: true });
}

/**
 * Apply a completed Checkout session: ensure the org exists and mark its
 * subscription ACTIVE. Keyed by the Stripe subscription id so re-processing
 * (e.g. a follow-up event for the same subscription) stays idempotent.
 */
async function applyCheckoutCompleted(
  tx: Prisma.TransactionClient,
  session: Stripe.Checkout.Session,
): Promise<void> {
  // Attribution comes from values the checkout route stamped server-side from
  // the verified Clerk token (never client-supplied at webhook time).
  const clerkOrgId = session.client_reference_id ?? session.metadata?.orgId ?? null;
  const tierId = session.metadata?.tier ?? null;
  const stripeSubscriptionId =
    typeof session.subscription === "string"
      ? session.subscription
      : (session.subscription?.id ?? null);

  if (!clerkOrgId || !tierId || !stripeSubscriptionId) {
    // Not enough context to attribute the subscription; the event is still
    // recorded (deduped) above so it won't be retried forever.
    return;
  }

  const org = await tx.organization.upsert({
    where: { clerkOrgId },
    create: { clerkOrgId, name: clerkOrgId },
    update: {},
  });

  // Exact period boundaries are reconciled by the quota meter (P1/T-105); the
  // webhook's job is to flip the subscription ACTIVE for this org.
  const now = new Date();
  const periodEnd = new Date(now);
  periodEnd.setMonth(periodEnd.getMonth() + 1);

  await tx.subscription.upsert({
    where: { id: stripeSubscriptionId },
    create: {
      id: stripeSubscriptionId,
      orgId: org.id,
      tierId,
      status: "ACTIVE",
      periodStart: now,
      periodEnd,
    },
    update: { status: "ACTIVE" },
  });
}
