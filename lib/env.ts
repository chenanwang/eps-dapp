/**
 * Startup environment validation. Imported by the Prisma client module so it
 * runs on server startup and fails fast with a clear error if any required env
 * var is missing, rather than surfacing a confusing failure deep in a request.
 */
const REQUIRED_ENV_VARS = [
  "DATABASE_URL",
  "RESEND_API_KEY",
  "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
  "CLERK_SECRET_KEY",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
] as const;

for (const key of REQUIRED_ENV_VARS) {
  if (!process.env[key]) {
    throw new Error("Missing required env var: " + key);
  }
}

// Soft validation: ENS resolution needs a real Ethereum *mainnet* RPC URL. A
// missing or placeholder value makes every ENS lookup return null with a 200,
// which is hard to diagnose — so warn loudly at startup instead of failing.
const ethRpc = process.env.EVM_RPC_ETH_MAINNET;
if (!ethRpc) {
  console.warn(
    "[env] EVM_RPC_ETH_MAINNET is not set — ENS resolution will fall back to a " +
      "public RPC that may be rate-limited or unreliable.",
  );
} else if (/YOUR_API_KEY|<.*>|sepolia|goerli|holesky/i.test(ethRpc)) {
  console.warn(
    "[env] EVM_RPC_ETH_MAINNET looks like a placeholder or non-mainnet URL: " +
      `"${ethRpc}". ENS resolution requires a valid Ethereum mainnet RPC endpoint.`,
  );
}

export const env = {
  DATABASE_URL: process.env.DATABASE_URL!,
  RESEND_API_KEY: process.env.RESEND_API_KEY!,
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY!,
  CLERK_SECRET_KEY: process.env.CLERK_SECRET_KEY!,
  STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY!,
  STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET!,
} as const;
