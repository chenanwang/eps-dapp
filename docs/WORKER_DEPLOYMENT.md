# Worker Deployment (T106)

The EPS fulfilment worker (`worker/index.ts`) is a **long-lived polling process**,
not a request handler. It cannot run on Vercel: Vercel's serverless/edge functions
are invoked per-request and time out (10–300 s depending on plan), so a process that
must poll the database every few seconds and survive between requests has nowhere to
live there. The Next.js app deploys to Vercel; **the worker deploys separately** to a
platform that runs persistent processes (Railway, Render, Fly.io, or any container
host).

## What the worker does

It drives `ServiceRequest` rows from `STAGED` → `CONFIRMED`/`FAILED`. The queue **is**
the Postgres table — there is no Redis. See `worker/index.ts` for the full contract.

- **Long-running** (`pnpm worker`): polls every `POLL_INTERVAL_MS` (5 s), claiming and
  processing one job per tick, forever.
- **Drain-and-exit** (`pnpm worker:once`, sets `DRAIN_AND_EXIT=1`): processes the whole
  backlog then exits 0 — used by the scheduled staging drain and by integration tests.

Job pickup is idempotent: a row is claimed by an atomic conditional `updateMany` to
`IN_PROGRESS`, so two pollers can never win the same row, and a row left `IN_PROGRESS`
by a crashed worker is re-claimed and resumed.

## Environment variables

The worker needs the same secrets as the app (it talks to the DB, the chain, Hedera,
storage, and Resend). At minimum:

| Var | Purpose |
|---|---|
| `DATABASE_URL` | Postgres (same DB as the app — shared queue) |
| `SOLANA_RPC` | devnet RPC (never mainnet — `assertNotMainnet()` enforces) |
| `APP_WALLET_KEYPAIR_PATH` or KMS env ref | app wallet signer (never commit the key) |
| `HEDERA_*` | HCS/HTS credentials (delivery still succeeds if these fail) |
| `R2_*` / S3 creds | document + certificate object storage |
| `RESEND_API_KEY` | certificate email |

> The worker logs only request ids and statuses — never caption or document bytes
> (CLAUDE.md hard rule #3).

## Deploy to Railway

```bash
# One-time
npm i -g @railway/cli
railway login
railway init                     # create/link a project

# Configure the start command and env, then deploy
railway variables --set "DATABASE_URL=..." \
                  --set "SOLANA_RPC=https://api.devnet.solana.com" \
                  # ...set the rest of the vars above
railway up                       # build & deploy from the repo
```

Set the service **Start Command** to:

```bash
pnpm worker
```

Railway keeps the process alive and restarts it on crash; because pickup is
idempotent, a restart mid-job resumes cleanly.

## Deploy to Render (alternative)

Create a **Background Worker** service (not a Web Service):

- **Build Command:** `pnpm install && pnpm prisma generate`
- **Start Command:** `pnpm worker`
- Add the env vars from the table above.

## Scheduled drain (no always-on worker)

If you prefer not to run an always-on process on staging, schedule the drain mode on a
cron (Railway cron job, Render cron job, or GitHub Actions schedule) instead:

```bash
pnpm worker:once     # DRAIN_AND_EXIT=1 — process backlog, then exit 0
```

This trades latency (jobs wait until the next run) for cost (no idle process). The
long-running `pnpm worker` is preferred for production-like delivery latency.

## Health / monitoring

The worker has no HTTP surface; monitor it by:

- watching the platform's process/restart logs, and
- alerting on `ServiceRequest` rows stuck in `IN_PROGRESS` or `STAGED` beyond an
  expected SLA (a stalled or crashed-and-not-restarted worker).

The **app**'s liveness is covered separately by `GET /api/health`.
