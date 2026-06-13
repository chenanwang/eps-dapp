# Staging Deployment Guide (T-504)

Staging runs against **devnet** and **Stripe test mode** only — never mainnet-beta, never live Stripe keys (CLAUDE.md hard rules #2, #7).

## Prerequisites

- Node 20+
- pnpm (`corepack enable && corepack prepare pnpm@latest --activate`)
- PostgreSQL 16 (a managed branch DB such as Neon is fine)
- Clerk **staging** application (test instance keys)
- Stripe in **test mode** (test secret + webhook signing secret)
- An S3-compatible object store (private bucket) for encrypted documents

## Environment setup

- Copy the example and fill in real values:
  ```bash
  cp .env.staging.example .env.staging
  ```
- Set every required var (validated at startup by `lib/env.ts`):
  `DATABASE_URL`, `RESEND_API_KEY`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`,
  `CLERK_SECRET_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`.
- Set the chain/storage/email vars (`SOLANA_RPC_URL` = devnet,
  `STORAGE_ENCRYPTION_KEY`, `MINIO_*`, `RESEND_FROM`).
- `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` are optional — leave
  unset to use the built-in process-local rate limiter.
- Never commit `.env.staging`.

## Database

- Apply migrations against the staging DB (non-interactive, no schema drift):
  ```bash
  pnpm prisma migrate deploy
  ```
- (Optional) Load seed data: `pnpm prisma db seed`.

## Build and run

```bash
pnpm install --frozen-lockfile
pnpm build
pnpm start
```

- Run the fulfilment worker in a separate process: `pnpm worker`.

## Health check

- Hit the unauthenticated endpoint:
  ```bash
  curl -s https://STAGING_HOST/api/health
  ```
- Expected `200` with JSON:
  ```json
  { "status": "ok", "timestamp": "2026-06-13T16:00:00.000Z", "db": "ok" }
  ```
- `"db": "error"` means the app is up but cannot reach Postgres — check
  `DATABASE_URL` and that `pnpm prisma migrate deploy` has run.
