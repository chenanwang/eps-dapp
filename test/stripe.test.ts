import { describe, it, expect, beforeEach, afterEach } from "vitest";

import { isTier, priceIdForTier, getStripe, TIER_PRICE_ENV } from "../lib/stripe";

describe("isTier", () => {
  it("accepts the three known tiers", () => {
    expect(isTier("tier1")).toBe(true);
    expect(isTier("tier2")).toBe(true);
    expect(isTier("tier3")).toBe(true);
  });

  it("rejects unknown / malformed values", () => {
    expect(isTier("tier4")).toBe(false);
    expect(isTier("TIER1")).toBe(false);
    expect(isTier("")).toBe(false);
    expect(isTier(undefined)).toBe(false);
    expect(isTier(1)).toBe(false);
  });
});

describe("priceIdForTier", () => {
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const envVar of Object.values(TIER_PRICE_ENV)) {
      saved[envVar] = process.env[envVar];
      delete process.env[envVar];
    }
  });

  afterEach(() => {
    for (const [envVar, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[envVar];
      else process.env[envVar] = value;
    }
  });

  it("returns the configured price ID for a tier", () => {
    process.env.STRIPE_TIER2_PRICE_ID = "price_tier2_abc";
    expect(priceIdForTier("tier2")).toBe("price_tier2_abc");
  });

  it("throws a helpful error when the price ID is not configured", () => {
    expect(() => priceIdForTier("tier1")).toThrow(/STRIPE_TIER1_PRICE_ID is not set/);
  });
});

describe("getStripe", () => {
  const savedKey = process.env.STRIPE_SECRET_KEY;

  afterEach(() => {
    if (savedKey === undefined) delete process.env.STRIPE_SECRET_KEY;
    else process.env.STRIPE_SECRET_KEY = savedKey;
  });

  it("refuses a live-mode secret key (CLAUDE.md hard rule #7)", () => {
    process.env.STRIPE_SECRET_KEY = "sk_live_should_be_rejected";
    expect(() => getStripe()).toThrow(/test-mode only/);
  });

  it("throws when no secret key is set", () => {
    delete process.env.STRIPE_SECRET_KEY;
    expect(() => getStripe()).toThrow(/STRIPE_SECRET_KEY is not set/);
  });
});
