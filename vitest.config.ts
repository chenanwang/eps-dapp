import { defineConfig } from "vitest/config";

// Unit suite: every *.test.ts under the repo EXCEPT the integration suite,
// which requires external services (solana-test-validator, etc.) and runs in
// its own CI job via `pnpm test:integration` (vitest run tests/integration).
export default defineConfig({
  test: {
    environment: "node",
    include: ["**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/.next/**", "tests/integration/**"],
  },
});
