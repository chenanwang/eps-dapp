import { describe, expect, it } from "vitest";

// Minimal smoke test so the CI `pnpm test` job is green on the P0 scaffold.
// The real unit/integration suites land in T-005.
describe("scaffold smoke", () => {
  it("runs the test toolchain", () => {
    expect(1 + 1).toBe(2);
  });
});
