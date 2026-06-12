import Stripe from "stripe";

/**
 * Subscription tiers offered by EPS. The string values are the wire format
 * accepted by the checkout API (`tier` param) — never change them without a
 * matching client/migration update.
 */
export type Tier = "tier1" | "tier2" | "tier3";

/** Maps each tier to the env var holding its Stripe price ID (set from `stripe-bootstrap.ts`). */
export const TIER_PRICE_ENV: Record<Tier, string> = {
  tier1: "STRIPE_TIER1_PRICE_ID",
  tier2: "STRIPE_TIER2_PRICE_ID",
  tier3: "STRIPE_TIER3_PRICE_ID",
};

/** Narrowing guard for untrusted input (e.g. a request body field). */
export function isTier(value: unknown): value is Tier {
  return value === "tier1" || value === "tier2" || value === "tier3";
}

/**
 * Resolve the Stripe price ID for a tier from the environment. Throws if the
 * price ID is not configured (bootstrap not run / env not populated).
 */
export function priceIdForTier(tier: Tier): string {
  const envVar = TIER_PRICE_ENV[tier];
  const priceId = process.env[envVar];
  if (!priceId) {
    throw new Error(
      `${envVar} is not set. Run \`pnpm tsx scripts/stripe-bootstrap.ts\` and paste the printed price IDs into .env.`,
    );
  }
  return priceId;
}

let stripeClient: Stripe | null = null;

/**
 * Lazily construct a shared Stripe client from `STRIPE_SECRET_KEY`. Refuses a
 * live-mode key — EPS is test-mode only (CLAUDE.md hard rule #7).
 */
export function getStripe(): Stripe {
  if (stripeClient) {
    return stripeClient;
  }
  const key = process.env.STRIPE_SECRET_KEY ?? "";
  if (!key) {
    throw new Error("STRIPE_SECRET_KEY is not set. Use a test-mode key (sk_test_...).");
  }
  if (key.startsWith("sk_live_") || key.startsWith("rk_live_")) {
    throw new Error(
      "Refusing to use a LIVE Stripe key. EPS is test-mode only (CLAUDE.md hard rule #7).",
    );
  }
  stripeClient = new Stripe(key);
  return stripeClient;
}
