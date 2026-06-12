# Autonomous Build Playbook — BLI E-Process Server
How to set Claude up to build, test, and ship this dApp with minimal human touch.

## 1. Tool selection — which Claude product does what

| Workstream | Tool | Why |
|---|---|---|
| Codebase build, tests, migrations, CI | **Claude Code** (terminal or VS Code) | Agentic: edits files, runs commands, runs the test validator, iterates on failures, commits, opens PRs |
| Long unattended runs / remote kickoff | **Claude Code from the mobile app** or `claude -p` headless in CI | Kick off a phase, review the PR later |
| Certificate template, legal copy, pricing pages, this workbook's upkeep, tester-review docs | **Claude Cowork** | Document/knowledge work alongside the repo |
| Tester walkthroughs of the deployed devnet app | **Claude in Chrome** (beta) | Drives the UI: signup → subscribe (test card) → file a service → open notice link → download certificate |
| Repo Q&A / PR review from Slack | **Claude Code for Slack** | Optional, for Jacqueline/Matty/Tejas visibility |

Human-in-the-loop points (deliberate, keep them): phase-gate PR approvals, anything tagged `needs-legal-copy-review`, Stripe product changes, and any wallet/key handling change.

## 2. One-time environment bootstrap (human or Claude Code with approval)

```bash
# Prereqs on the dev box / VM
node 20+, pnpm, docker, git, gh CLI
sh -c "$(curl -sSfL https://release.anza.xyz/stable/install)"   # Solana CLI (agave)
stripe login                                                     # Stripe CLI, test mode

# Repo
gh repo create bli/eps --private && cd eps
# drop in: CLAUDE.md, docs/ (SOW, this playbook, PHASES.md), .github/workflows/ci.yml
claude   # start Claude Code; first instruction: "Read CLAUDE.md and docs/PHASES.md, begin Phase 0"
```

Recommended host: a small Ubuntu VPS or devcontainer ("virtual server") so runs are reproducible and Claude Code can be left running:
- 2 vCPU / 8 GB is enough for Next.js + Postgres + MinIO + solana-test-validator
- devcontainer.json pins Node/Solana/Stripe CLI versions; same image used in CI
- Claude Code permissions: allow `pnpm *`, `docker compose *`, `git *`, `solana *` within the repo; deny network beyond package registries + devnet RPC + api.stripe.com (test) — mirrors least-privilege

## 3. Local "testnet" strategy (three rings)

**Ring 1 — solana-test-validator (every test run).** Spawned by the integration suite; instant finality, free airdrops, deterministic. All chain logic (build tx, send, persist-sig-then-confirm, memo verify, failure/retry paths) is proven here. CI runs it as a background service step.

**Ring 2 — devnet (daily/staging).** Real network latency, real finalization timing, occasional RPC flakiness — exactly what the retry/idempotency code must survive. App wallet funded by `solana airdrop` (script keeps balance ≥ 1 SOL, alerts below 0.2). Staging deploy (Vercel preview + Neon branch) points here; testers use it.

**Ring 3 — never mainnet** in this engagement. `assertNotMainnet()` guard + CI grep that fails on `mainnet-beta` outside the guard file.

Stripe equivalent: test mode + `stripe listen` locally; `stripe trigger checkout.session.completed` and fixture replays in integration tests. Clerk: dev instance with test users. Email: Resend test domain, assert via API not inbox.

## 4. CI/CD (GitHub Actions) — Claude's automated examiner

`ci.yml` jobs on every PR:
1. **lint+typecheck** — eslint, tsc --noEmit
2. **unit** — vitest
3. **integration** — services: postgres, minio; steps install Solana CLI, start `solana-test-validator -r --quiet &`, run `pnpm test:int` (covers: address validation incl. off-curve, hash/encrypt/store, worker happy path, send-fail-retry-reconfirm, webhook dedupe, quota enforcement, notice-access logging, certificate PDF fields)
4. **e2e** — Playwright against `pnpm build && pnpm start` with mocked Clerk + Stripe test mode (smoke: file a service end-to-end on local validator)
5. **secret-scan + mainnet-grep** — gitleaks; fail on stray keys or mainnet refs

Optional: a scheduled `claude -p "run the Phase N gate checklist and report"` headless job that comments results on the gate PR.

## 5. Phase plan with gates (mirrored in workbook + docs/PHASES.md)

- **Phase 0 — Scaffold (gate: CI green on hello-world):** repo, devcontainer, Next.js+TS+Tailwind, Prisma + docker compose (Postgres, MinIO), Clerk wired, CI pipeline, seed script.
- **Phase 1 — Subscriptions (gate: tier quota visible on dashboard, webhook replay-safe):** Org model, Stripe bootstrap script, subscription checkout + promo code, webhook handlers + dedupe, comp-grant admin route, quota meter.
- **Phase 2 — Intake (gate: STAGED record with encrypted object + notice token):** upload (MIME+magic bytes, 25 MB), address validation, case-caption form, attestation, SHA-256, AES-GCM encrypt → MinIO, Service record + AuditLog, quota decrement.
- **Phase 3 — Chain delivery (gate: integration suite green incl. retry tests on local validator; one manual devnet delivery verified in explorer):** ChainAdapter, transfer+memo build, worker loop, persist-sig-before-confirm, finalized confirm, re-read verification, failure → quota restore.
- **Phase 4 — Notice link + certificate (gate: certificate PDF matches sample-certificate field spec; first-access addendum works):** `/n/<token>` page, access logging, pdf-lib certificate with declaration block, Resend emails, dashboard list + downloads.
- **Phase 5 — Hardening + staging (gate: tester sign-off on devnet staging):** rate limits, balance monitor, error surfaces, audit-log viewer, Playwright e2e, deploy staging, tester script executed (Claude in Chrome assisted).
- **Phase 6 (v1.5, optional) — NFT Service Token:** Token-2022 mint + airdrop behind ChainAdapter, certificate notes mint address.

Each gate = a PR using `.github/PULL_REQUEST_TEMPLATE/phase-gate.md` checklist; human approval advances the phase.

## 6. Daily autonomous loop (what Claude Code actually does)

1. `git pull`, read `docs/PHASES.md`, pick the top unblocked task in the current phase
2. Write/extend tests first where practical → implement → run `pnpm lint typecheck test [test:int]` until green
3. Update PHASES.md row (status, SHA, notes); commit; push; open/refresh the phase PR
4. On repeated failure: file `docs/blockers/`, move on; never weaken a test to pass it
5. End of session: post a summary comment on the phase PR (done / in-flight / blocked / next)

## 7. Tester review process (feeds the Phase 5 gate)
Script (Cowork maintains it in `docs/TESTER_SCRIPT.md`): create account → verify email + 2FA → subscribe Tier 1 with card 4242… and EARLYADOPTER50 → upload sample summons PDF → enter a fresh devnet wallet you control → submit → watch status reach NOTIFIED → confirm tx in Solana Explorer (devnet) → open the notice link from a different device → re-download certificate and confirm the access addendum → attempt a 2nd filing (quota block expected). Defects filed as GitHub issues labeled `tester`; Claude Code triages into the current phase.
