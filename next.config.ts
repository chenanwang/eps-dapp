import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  eslint: {
    // ESLint runs in CI (pnpm lint). Skip during next build to avoid
    // --max-warnings 0 failures on warnings that are not build-blocking.
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
