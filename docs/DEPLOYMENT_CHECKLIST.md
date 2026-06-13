# EPS Deployment Checklist

Pre- and post-deploy checklist for the EPS dApp. Covers every required env var
grouped by service, what still needs a real value, and how to verify each
service after a deploy.

> **Never** put real secrets in the repo. Local dev reads `.env` (gitignored);
> deployed envs read from the Vercel project / KMS. See `.env.example` for the
> full annotated list.

---

## 1. Required environment variables by service

### Core / Database
| Var | Required | Notes |
|-----|----------|-------|
| `DATABASE_URL` | ✅ | Postgres 16 connection string. Validated at startup by `lib/env.ts` — the app fails fast if missing. |

### Auth (Clerk)
| Var | Required | Notes |
|-----|----------|-------|
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | ✅ | Public key (client). |
| `CLERK_SECRET_KEY` | ✅ | Server token verification on every API route. |
| `NEXT_PUBLIC_CLERK_SIGN_IN_URL` | ➖ | Defaults to `/sign-in`. |
| `NEXT_PUBLIC_CLERK_SIGN_UP_URL` | ➖ | Defaults to `/sign-up`. |

### Payments (Stripe — TEST MODE ONLY, hard rule #7)
| Var | Required | Notes |
|-----|----------|-------|
| `STRIPE_SECRET_KEY` | ✅ | Drives checkout + webhook routes. Test key only. |
| `STRIPE_WEBHOOK_SECRET` | ✅ | Verifies `Stripe-Signature` on `POST /api/webhooks/stripe`. |
| `STRIPE_TIER1_PRICE_ID` / `TIER2` / `TIER3` | ✅ | Printed by `pnpm tsx scripts/stripe-bootstrap.ts`. |

### Storage (S3-compatible / MinIO local)
| Var | Required | Notes |
|-----|----------|-------|
| `STORAGE_ENCRYPTION_KEY` | ✅ | 32-byte AES-256-GCM key (hex/base64). `openssl rand -hex 32`. Documents are encrypted at rest. |
| `MINIO_ENDPOINT` / `MINIO_ACCESS_KEY` / `MINIO_SECRET_KEY` / `MINIO_BUCKET` | ✅ | Private bucket; key refs only in DB (hard rule #3). |

### Solana chain delivery
| Var | Required | Notes |
|-----|----------|-------|
| `SOLANA_RPC_URL` | ✅ | devnet for dev/staging; `localhost:8899` for tests. **Never mainnet** — `assertNotMainnet()` throws (hard rule #2). |
| `SOLANA_SIGNER_KEYPAIR` | ✅ | App wallet secret (base58). From env only — never logged/persisted (hard rule #1). |

### Email (Resend)
| Var | Required | Notes |
|-----|----------|-------|
| `RESEND_API_KEY` | ✅ | When unset, sends are skipped (alerts never block delivery). |
| `RESEND_FROM` | ➖ | Must be a Resend-verified sender; placeholder otherwise. |

### Hedera (Phase 3 — HCS + HTS, non-blocking)
| Var | Required | Notes |
|-----|----------|-------|
| `HEDERA_OPERATOR_ID` | ⚠️ needs real value | Testnet account `0.0.XXXXX`. |
| `HEDERA_OPERATOR_KEY` | ⚠️ needs real value | DER private key. |
| `HEDERA_HCS_TOPIC_ID` | ⚠️ needs real value | Proof-of-service topic. |
| `HEDERA_NFT_TOKEN_ID` | ⚠️ needs real value | HTS receipt token. |
| `HEDERA_NETWORK` | ➖ | `testnet`. |

> Hedera failures are caught and logged — they **must not** fail delivery
> (CLAUDE.md). The worker still reaches `CONFIRMED` without Hedera configured.

### ENS / EVM (Phase 2)
| Var | Required | Notes |
|-----|----------|-------|
| `EVM_APP_WALLET_PRIVATE_KEY` / `EVM_APP_WALLET_ADDRESS` | ➖ | Agent identity for ENS records / EVM calldata. |
| `EVM_RPC_ETH_MAINNET` | ➖ | ENS resolution RPC (read-only mainnet name lookups). |
| `EVM_RPC_ETH_SEPOLIA` | ➖ | Testnet EVM RPC. |

### Dynamic (Phase 4 — Flow + MPC server wallet)
| Var | Required | Notes |
|-----|----------|-------|
| `NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID` | ⚠️ needs real value | Dynamic environment UUID. |
| `DYNAMIC_BEARER_TOKEN` | ⚠️ needs real value | API bearer token. |
| `EPS_AGENT_WALLET_ID` | ⚠️ needs real value | From `scripts/create-agent-wallet.ts`. |
| `DYNAMIC_WALLET_PASSWORD` | ➖ | Server wallet password. |

---

## 2. Status: set in Vercel vs still needs a real value

- **Set (placeholders or real) in Vercel already (20 vars, Phase 1):** the Core,
  Auth, Stripe, Storage, Solana, and Email groups above.
- **Still need real values before the matching feature works end-to-end:**
  - `NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID`, `DYNAMIC_BEARER_TOKEN`, `EPS_AGENT_WALLET_ID`
  - `HEDERA_OPERATOR_ID`, `HEDERA_OPERATOR_KEY`, `HEDERA_HCS_TOPIC_ID`, `HEDERA_NFT_TOKEN_ID`

These are all **non-blocking** for core delivery: the worker confirms on Solana
regardless, and Hedera/Dynamic degrade gracefully when unset.

---

## 3. Post-deploy verification commands

```bash
# Health + DB connectivity (expects {"status":"ok","db":"connected","version":"1.0.0",...})
curl -s https://<deploy-host>/api/health | jq

# ENS resolution (returns {"address": "0x...", ...} when the RPC is reachable)
curl -s "https://<deploy-host>/api/ens/resolve?input=vitalik.eth" | jq

# Stripe webhook signature gate (no signature → 400, never a write)
curl -s -o /dev/null -w "%{http_code}\n" -X POST https://<deploy-host>/api/webhooks/stripe

# Auth boundary (protected route redirects, never 200-leaks the dashboard)
curl -s -o /dev/null -w "%{http_code}\n" https://<deploy-host>/dashboard
```

Service-level checks:
- **DB** — `/api/health` shows `"db":"connected"`.
- **Stripe** — send a test event from the Stripe CLI / dashboard; confirm a
  `WebhookEvent` row is written once and a replay is a deduped no-op.
- **Solana** — stage a request and watch the worker drive it to `CONFIRMED`
  with a finalized `txSignature`.
- **Hedera** — after a delivery, confirm `hcsTopicId` / `htsTokenId` populate
  (or are cleanly absent when unconfigured); verify on
  https://testnet.mirrornode.hedera.com.

---

## 4. Worker deployment (important)

The fulfilment worker (`pnpm worker`) is a **long-running poll loop** and
Vercel's serverless runtime does **not** support always-on processes. Deploy it
one of these ways:

1. **Separate always-on host** (recommended) — a small VM / container /
   Railway / Fly / Render service running `pnpm worker`. It only needs the
   Database, Solana, Storage, Email, and (optional) Hedera env vars.
2. **Scheduled drain** — run `pnpm worker:once` (`DRAIN_AND_EXIT=1`) on a cron
   (e.g. Vercel Cron hitting a small internal endpoint, or GitHub Actions
   schedule). It processes the entire backlog and exits 0. Trade-off: delivery
   latency is bounded by the cron interval.

Either way the worker is **idempotent**: a job interrupted mid-flight is
re-claimed and resumed (signature persisted before confirm — never re-sent), so
restarts and overlapping cron ticks are safe.

> Do **not** rely on the Next.js app process to run deliveries — the app never
> spawns the worker. Run it explicitly via one of the options above.
