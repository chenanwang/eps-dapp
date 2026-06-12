# Free Hosting Plan — Replacing the Dedicated VPS with GitHub-Native Infrastructure
## BLI E-Process Server build — addendum to AUTONOMOUS_BUILD_PLAYBOOK.md §2

The dedicated VPS in the playbook served four jobs. Each can be replaced with a free tier, three of them GitHub-native:

| Job the VPS was doing | Free replacement | Quota (verified June 2026) |
|---|---|---|
| 1. Dev box where Claude Code works | **GitHub Codespaces** (devcontainer we already spec'd) | 120 core-hours/mo + 15 GB storage per personal account |
| 2. CI test rig (lint/type/unit/integration w/ solana-test-validator) | **GitHub Actions** hosted runners | 2,000 min/mo private (Free plan); 50,000 min/mo on Team; unlimited on public repos |
| 3. Always-on fulfilment worker | **GitHub Actions scheduled workflow** (drain-and-exit worker) for staging; Codespace process during dev sessions | Same Actions quota |
| 4. Public staging app + DB + object storage | **Vercel Hobby + Neon Free + Cloudflare R2 Free** (GitHub-integrated, not GitHub-owned) | Hobby: 100 GB-hrs functions; Neon: 0.5 GB Postgres + branching; R2: 10 GB + zero egress fees |

GitHub Pages stays in the picture only for static content (docs site, the public verification page in v2 if rendered statically) — it cannot run the Next.js server, the worker, or Postgres.

---

## 1. The multiplier: BLIF's 501(c)(3) status

GitHub for Nonprofits grants **free GitHub Team** to verified 501(c)(3) organizations. That moves the private-repo Actions quota from 2,000 to **50,000 minutes/month (~833 runner-hours)** — more compute than the VPS would have provided — plus branch protection and required reviewers for the phase-gate process.

**How:** github.com/nonprofit → apply with BLIF's EIN and determination letter → create org `blif-eps` (or move the repo into the existing BLIF org) once approved. Do this first; everything else hangs off it. (Approval typically takes days; start on the personal Free plan meanwhile — 2,000 min/mo is enough for Phases 0–1.)

Do **not** make the repo public to get unlimited Actions minutes. This is proprietary legal-tech with paying-customer pricing already published; the nonprofit Team quota makes public-repo economics unnecessary.

## 2. Codespaces as the Claude Code dev box

The devcontainer.json from the playbook works unchanged — Codespaces is literally a hosted devcontainer. Docker-in-Codespaces runs the compose stack (Postgres + MinIO), and solana-test-validator runs fine in it.

**Setup:**
1. Commit `.devcontainer/devcontainer.json` pinning Node 20, pnpm, Solana CLI, Stripe CLI (features or a postCreate script).
2. Repo → Code → Codespaces → create on `main`. Choose the **2-core machine** by default.
3. Inside the Codespace terminal: `npm i -g @anthropic-ai/claude-code && claude` → "Read CLAUDE.md, begin current phase."
4. Settings → Codespaces: set default idle timeout to 30 min and **delete stopped codespaces you're done with** — stopped instances keep billing storage against the 15 GB cap, and Solana CLI + node_modules + Docker images will eat most of it. One codespace at a time.

**Budget math:** 120 core-hours = 60 clock-hours/mo on 2-core, only 30 on 4-core. Interactive Claude Code sessions fit comfortably; long unattended runs do not. So:

## 3. Long autonomous runs → Claude Code GitHub Action (the real VPS killer)

Install **anthropics/claude-code-action** in the repo. Claude then runs *on Actions runners*, drawing from the 50k-minute Team quota instead of your Codespaces hours:

- Comment `@claude implement T-204 per docs/PHASES.md` on an issue/PR → Claude works the task in a runner, pushes a branch, opens/updates the PR.
- A scheduled workflow can run `claude -p "execute the current phase-gate checklist and comment results on the gate PR"` nightly.
- Setup: `claude` → `/install-github-app` (or add the workflow manually with `ANTHROPIC_API_KEY` as a repo secret). Scope its permissions to the repo; it inherits the same CLAUDE.md rules, including the mainnet guard.

This gives you the playbook's "leave it running" capability with zero servers: you assign tasks from your phone via GitHub issues, and phase-gate PR approval remains the human checkpoint.

## 4. CI on Actions (unchanged from playbook, now quota-aware)

The ci.yml design carries over — Postgres + MinIO as service containers, install Solana CLI, `solana-test-validator -r --quiet &`, run the suites. Ubuntu runners only (macOS burns minutes at 10x). Practical burn rate: a 10-min pipeline × ~15 runs/day ≈ 4,500 min/mo — 9% of the Team quota. Add `concurrency: cancel-in-progress` and path filters to avoid waste.

## 5. The worker without a server

The worker is a poll loop, so for dev/staging volumes convert it to **drain-and-exit** mode (`pnpm worker:once` processes all pending jobs, then exits) and trigger it three ways:

- **Dev:** runs continuously inside the Codespace (`pnpm worker`).
- **CI/integration tests:** invoked directly by the test suite.
- **Staging:** a scheduled workflow (`schedule: cron '*/5 * * * *'`) checks out, connects to Neon + devnet, runs `worker:once`. Two caveats to document in the workbook: GitHub cron is best-effort (runs are commonly delayed 5–15 min under load — fine for testing, not a production SLA), and scheduled workflows auto-disable after 60 days of repo inactivity. Add a `workflow_dispatch` trigger so testers can force a drain from the Actions tab when demoing.

For production later, this worker moves to a $5–7/mo container host or the eventual paid infra — flag it as a known free-tier seam, not a design flaw.

## 6. Staging stack (GitHub-adjacent free tiers)

- **Vercel Hobby** — import the GitHub repo; every PR gets a preview URL; staging = the `staging` branch deployment. Env vars point at devnet RPC, Neon, R2, Clerk dev, Stripe test. Note: Hobby is licensed for non-commercial use — acceptable for an internal devnet pilot, but the moment paying subscribers touch it you need Vercel Pro ($20/mo) or another host.
- **Neon Free** — serverless Postgres with branching; create a `staging` branch DB per the playbook. 0.5 GB is ample (records are metadata; documents live in object storage).
- **Cloudflare R2 Free** — S3-compatible, 10 GB storage, 1M writes/mo, **zero egress fees**; the code already targets the S3 API via MinIO, so staging only swaps endpoint + credentials. Buckets private; encrypted blobs as designed.
- Stripe test mode, Clerk dev instance, Resend test domain — all free, unchanged.

## 7. If you genuinely want a free *VPS* anyway

Outside GitHub: **Oracle Cloud Always Free** (up to 4 Arm OCPUs / 24 GB RAM, genuinely free, capacity permitting in your home region) is the only free offering that behaves like a real always-on server and would run the entire compose stack + worker + validator. Trade-offs: Arm builds, capacity lottery at signup, and accounts get reclaimed if idle. Use it only if the Actions-cron worker proves too laggy for tester demos; otherwise the GitHub-native plan above is simpler and better integrated.

## 8. Execution order

1. Apply: GitHub for Nonprofits (BLIF EIN) → free Team org.
2. Create/move private repo into the org; enable branch protection on `main`; add phase-gate PR template.
3. Commit devcontainer + ci.yml; verify CI green on hello-world (Phase 0 gate).
4. `/install-github-app` for Claude Code Action; add `ANTHROPIC_API_KEY` secret; test with a trivial `@claude` issue.
5. Create the 2-core Codespace; run the Env Checklist items E-05 → E-10 inside it.
6. Wire Vercel (Hobby) + Neon + R2; add the scheduled `worker-drain.yml` with `workflow_dispatch`.
7. Update workbook Env Checklist: E-01 now reads "Codespaces devcontainer (2-core)"; add E-14 nonprofit Team approval, E-15 Claude Code Action installed, E-16 worker-drain schedule live; log as CC-002 on Change Control.

**Monthly cost of the whole build phase: $0** (plus Anthropic API usage for the Claude Code Action), with the single seam being worker latency on staging — acceptable until revenue justifies a $7 container.
