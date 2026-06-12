import { NextResponse } from "next/server";
import { requireAuth, UnauthorizedError } from "@/lib/auth";
import { getStripe, isTier, priceIdForTier } from "@/lib/stripe";

/**
 * POST /api/checkout — create a Stripe Checkout session for a subscription tier.
 *
 * Auth is required: the caller's org/user come from the verified Clerk session
 * token, never the request body. The session runs in `subscription` mode with
 * `allow_promotion_codes: true`, so the hosted Checkout page shows a promo-code
 * field (e.g. EARLYADOPTER50 → 50% off). The org is stamped onto the session and
 * subscription metadata so the webhook handler (T-104) can attribute it.
 *
 * Body: `{ "tier": "tier1" | "tier2" | "tier3" }`
 * Returns: `{ "url": string }` — the Checkout page to redirect the browser to.
 */
export async function POST(req: Request): Promise<Response> {
  let authContext;
  try {
    authContext = await requireAuth();
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

  const tier = (body as { tier?: unknown } | null)?.tier;
  if (!isTier(tier)) {
    return NextResponse.json(
      { error: "Invalid tier. Expected one of: tier1, tier2, tier3." },
      { status: 400 },
    );
  }

  const origin = req.headers.get("origin") ?? new URL(req.url).origin;

  const stripe = getStripe();
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    allow_promotion_codes: true,
    line_items: [{ price: priceIdForTier(tier), quantity: 1 }],
    // Tie the subscription back to the org for the webhook handler (T-104).
    client_reference_id: authContext.orgId,
    metadata: { orgId: authContext.orgId, userId: authContext.userId, tier },
    subscription_data: { metadata: { orgId: authContext.orgId, tier } },
    success_url: `${origin}/dashboard?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/pricing?checkout=cancelled`,
  });

  return NextResponse.json({ url: session.url });
}
