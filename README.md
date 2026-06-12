# BLI E-Process Server (EPS) dApp

Private — work in progress. See `docs/EPS_SOW_v1.1.md` for the full scope of work.

## Quick start

```bash
pnpm install
pnpm db:up        # docker compose: Postgres + MinIO
pnpm db:migrate   # prisma migrate dev
pnpm dev          # Next.js app
pnpm worker       # fulfilment worker
```

See `CLAUDE.md` for the full build guide and `docs/PHASES.md` for task tracking.
