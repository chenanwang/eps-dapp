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

export const env = {
  DATABASE_URL: process.env.DATABASE_URL!,
  RESEND_API_KEY: process.env.RESEND_API_KEY!,
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY!,
  CLERK_SECRET_KEY: process.env.CLERK_SECRET_KEY!,
  STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY!,
  STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET!,
} as const;
