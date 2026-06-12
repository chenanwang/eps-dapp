import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Unit suite: every *.test.ts under the repo EXCEPT the integration suite,
// which requires external services (solana-test-validator, etc.) and runs in
// its own CI job via `pnpm test:integration` (vitest run tests/integration).
export default defineConfig({
  // Mirror the `@/*` -> repo-root alias from tsconfig.json so app/lib modules
  // that import via `@/...` resolve under vitest.
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/.next/**", "tests/integration/**"],
  },
});
