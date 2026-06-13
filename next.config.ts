import type { NextConfig } from "next";

/**
 * Baseline security headers applied to every response (T107 hardening). These
 * are transport/UA hardening only — they do not weaken Clerk or Stripe, which
 * set their own cookies where needed. No `Content-Security-Policy` is set here:
 * a strict CSP needs per-page nonces for Clerk/Stripe scripts and is its own
 * task; a loose one would be worse than none.
 */
const securityHeaders = [
  // Stop MIME sniffing of responses.
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Disallow framing — the app is never meant to be embedded (clickjacking).
  { key: "X-Frame-Options", value: "DENY" },
  // Don't leak full URLs (which can carry notice tokens) to other origins.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Drop powerful browser features the app never uses.
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  // Force HTTPS for two years incl. subdomains (honoured only over HTTPS).
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
];

const nextConfig: NextConfig = {
  eslint: {
    // ESLint runs in CI (pnpm lint). Skip during next build to avoid
    // --max-warnings 0 failures on warnings that are not build-blocking.
    ignoreDuringBuilds: true,
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
