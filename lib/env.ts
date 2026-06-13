/**
 * Startup environment validation. Imported by the server entrypoints (e.g.
 * `lib/db.ts`) so the app fails fast with a clear error at module load time if
 * any required env var is missing, rather than failing deep inside a request.
 */

const REQUIRED_ENV_VARS = [
  "DATABASE_URL",
  "RESEND_API_KEY",
  "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
  "CLERK_SECRET_KEY",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
] as const;

type RequiredEnvVar = (typeof REQUIRED_ENV_VARS)[number];

for (const key of REQUIRED_ENV_VARS) {
  if (!process.env[key]) {
    throw new Error("Missing required env var: " + key);
  }
}

export const env: Record<RequiredEnvVar, string> = {
  DATABASE_URL: process.env.DATABASE_URL!,
  RESEND_API_KEY: process.env.RESEND_API_KEY!,
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY!,
  CLERK_SECRET_KEY: process.env.CLERK_SECRET_KEY!,
  STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY!,
  STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET!,
};
