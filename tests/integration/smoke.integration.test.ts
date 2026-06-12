import { describe, expect, it } from "vitest";

// Integration smoke test. This job runs against external services in CI
// (a `solana-test-validator` service on localhost:8899). For the P0 scaffold
// it only asserts the toolchain wiring; real chain/Stripe/storage integration
// tests land in later phases (P3+). It deliberately makes NO mainnet call.
describe("integration smoke", () => {
  it("runs the integration toolchain", () => {
    expect(1 + 1).toBe(2);
  });

  it("never targets mainnet-beta (hard rule #2)", () => {
    const rpc = process.env.SOLANA_RPC ?? "http://localhost:8899";
    expect(rpc).not.toContain("mainnet");
  });
});
