/**
 * Unit tests for lib/payments/UnlinkPrivacy.ts (T102).
 *
 * NOTE: `@unlink-xyz/sdk` is not yet generally available in the npm registry,
 * so the real deposit() call is still stubbed out in the source. These tests
 * therefore assert the *graceful* contract the rest of the app depends on:
 * depositToPrivateAccount never throws and returns null when the SDK is
 * unavailable, so a privacy failure can never break the payment path.
 */
import { describe, it, expect } from "vitest";
import { depositToPrivateAccount } from "@/lib/payments/UnlinkPrivacy";

const PARAMS = {
  amount: "200.00",
  tokenSymbol: "USDC",
  chainId: 8453,
  fromAddress: "0x0000000000000000000000000000000000000001",
};

describe("depositToPrivateAccount", () => {
  it("returns null (does not throw) when the Unlink SDK is unavailable", async () => {
    await expect(depositToPrivateAccount(PARAMS)).resolves.toBeNull();
  });

  it("is resilient to repeated calls", async () => {
    const a = await depositToPrivateAccount(PARAMS);
    const b = await depositToPrivateAccount(PARAMS);
    expect(a).toBeNull();
    expect(b).toBeNull();
  });
});
