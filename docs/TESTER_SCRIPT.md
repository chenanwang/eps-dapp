# TESTER_SCRIPT.md — Devnet Staging Sign-Off Checklist (T-506)

This script lets a human tester verify the full happy path of the EPS dApp
end-to-end on **devnet staging**. The P5 gate (`docs/PHASES.md`) requires tester
sign-off on this script with **zero open SEV-1/2** issues.

> **Scope & language.** The EPS platform **facilitates** service of process and
> **generates court-ready proof** of delivery. It does **not** itself effect
> valid legal service (CLAUDE.md hard rule #6). Read every cover sheet,
> certificate, and email through that lens — flag any copy that overclaims.
>
> **Hard rules for this run.**
> - All wallet addresses MUST be **devnet** — never mainnet-beta (hard rule #2).
> - Stripe is in **test mode** only — never a live-mode key (hard rule #7).
> - Use **no real PII**. Caption/party names must be obvious test fixtures
>   (e.g. "Acme Test Co. v. Doe Test Defendant").
> - Document bytes are confidential — do not paste them into issues or logs
>   (hard rule #3). Reference the SHA-256 and notice token instead.

Record the result of each step in the **Result** column. Anything that does not
match **Expected** becomes a row in the [SEV-1/2 triage table](#sev-12-triage)
at the bottom.

---

## 0. Conventions

- `STAGING_HOST` — the staging base URL (e.g. the Vercel preview URL).
- `<noticeToken>` — the 32-hex-char (128-bit) token minted at intake.
- `<serviceRequestId>` — the `ServiceRequest.id` (the certificate route's path
  param; the route folder is `[noticeId]` but it resolves the request by `id`).
- DB checks assume a `psql`/Prisma Studio connection to the staging
  `DATABASE_URL`. Run read-only `SELECT`s; do not mutate rows by hand.
- Curl examples that hit auth-gated routes need a valid Clerk session cookie —
  easiest is to perform those steps in the browser while signed in, or copy the
  `__session` cookie into curl with `-b "__session=<token>"`.

---

## 1. Prerequisites

Confirm each before starting. Tick the box; if anything is missing, stop and
raise it — do not proceed on a partial environment.

- [ ] **Node 20+** and **pnpm 9** installed (`node -v`, `pnpm -v`).
- [ ] `.env.staging` filled from `.env.staging.example` — every required var set
      (`DATABASE_URL`, Clerk keys, Stripe **test** keys, `STRIPE_WEBHOOK_SECRET`,
      `STORAGE_ENCRYPTION_KEY`, `MINIO_*`, `SOLANA_RPC_URL`=devnet,
      `SOLANA_SIGNER_KEYPAIR`, `RESEND_API_KEY`/`RESEND_FROM`).
      `lib/env.ts` fails fast at startup on any missing required var.
- [ ] **Devnet SOL** in the signer wallet (the `SOLANA_SIGNER_KEYPAIR` pubkey):
      airdrop with `solana airdrop 2 <PUBKEY> --url devnet` and confirm
      `solana balance <PUBKEY> --url devnet` ≥ ~0.1 SOL.
- [ ] `SOLANA_RPC_URL` points at **devnet** (`https://api.devnet.solana.com`) —
      confirm it does NOT contain `mainnet` (the ChainAdapter throws if it does).
- [ ] **Stripe test mode** keys configured (`sk_test_…`), and Tier1/2/3 price IDs
      pasted from `pnpm tsx scripts/stripe-bootstrap.ts`.
- [ ] **Clerk** staging (dev) instance credentials configured; email verify + 2FA
      enabled on the instance.
- [ ] **MinIO / S3-compatible** storage running and the private bucket
      (`MINIO_BUCKET`) reachable.
- [ ] Migrations applied to the staging DB: `pnpm prisma migrate deploy`.
- [ ] App and worker reachable: `pnpm build && pnpm start` (app),
      worker available via `pnpm worker:once` or the **worker-drain** Actions
      workflow (`workflow_dispatch`).
- [ ] A **test PDF** on hand to upload (non-confidential dummy content).

---

## 2. Health check (pre-test)

```bash
curl -s https://STAGING_HOST/api/health
```

- **Expected:** `200` with `{ "status": "ok", "db": "ok", "timestamp": "…" }`.
- **If `"db": "error"`:** app is up but cannot reach Postgres — fix
  `DATABASE_URL` / re-run `prisma migrate deploy` before continuing. **SEV-1.**

| Result | |
|---|---|
| Status code | |
| `db` field | |

---

## 3. Subscription setup

1. Sign in to `https://STAGING_HOST` with a Clerk test user and **create a Clerk
   organization** (the org is the billing tenant).
2. As an org member, start checkout for **Tier1**:
   ```bash
   curl -s -X POST https://STAGING_HOST/api/checkout \
     -H "Content-Type: application/json" \
     -b "__session=<clerk_session>" \
     -d '{"tier":"tier1"}'
   ```
   - **Expected:** `200` with `{ "url": "https://checkout.stripe.com/…" }`.
   - (Or click **Subscribe** on `/pricing`, which POSTs this for you and
     redirects to the Stripe-hosted page.)
3. Complete the Stripe **test** checkout with card **`4242 4242 4242 4242`**, any
   future expiry, any CVC, any ZIP.
   - (Optional) apply promo **`EARLYADOPTER50`** in the promo-code field and
     confirm 50% off shows.
4. Stripe redirects to `/dashboard?checkout=success&session_id=…`.
5. Verify the webhook landed and the subscription is **ACTIVE** in the DB:
   ```sql
   SELECT s."tierId", s.status, s."usageCount"
   FROM "Subscription" s
   JOIN "Organization" o ON o.id = s."orgId"
   WHERE o."clerkOrgId" = '<your_clerk_org_id>';
   ```

- **Expected:** one row, `tierId = tier1`, `status = ACTIVE`, `usageCount = 0`.

| Result | |
|---|---|
| `/api/checkout` returned URL | |
| Stripe test checkout completed | |
| Subscription status in DB | |

---

## 4. Service request submission

1. Signed in as the org member, navigate to **`/dashboard/new`**.
2. Fill the form with **test data only** (no real PII):
   - **Case caption** — e.g. `Acme Test Co. v. Doe Test Defendant`
   - **Plaintiff** — e.g. `Acme Test Co.`
   - **Defendant** — e.g. `Doe Test Defendant`
   - **Recipient wallet** — an **on-curve devnet** address. Generate a fresh one:
     `solana-keygen new --no-bip39-passphrase -o /tmp/recipient.json` then
     `solana address -k /tmp/recipient.json`. (An off-curve/PDA address is
     rejected with a clear error — that is the negative path, not this one.)
   - **Upload** the test PDF.
   - **Check the attestation** box (submit stays disabled until attested).
3. Submit.

Verify the staged record:
```sql
SELECT id, status, "noticeToken", "courtOrderFlag", "documentSha256"
FROM "ServiceRequest"
ORDER BY "createdAt" DESC LIMIT 1;
```

- **Expected:** `201` from `POST /api/service-requests`; a row with
  `status = STAGED` and a non-null 32-hex-char `noticeToken`. Note the `id`
  (= `<serviceRequestId>`) and `noticeToken` for later steps.
- **Confidentiality:** confirm no caption/party/document bytes appear in app
  logs (hard rule #3).

| Result | |
|---|---|
| Submission HTTP status | |
| Row status | |
| `noticeToken` present (32 hex) | |
| `<serviceRequestId>` | |

---

## 5. Worker drain (chain delivery)

Trigger fulfilment one of two ways:

- **Locally:** `pnpm worker:once` (drain-and-exit mode), **or**
- **CI:** GitHub → **Actions → worker-drain → Run workflow** (`workflow_dispatch`)
  on the `staging` environment.

Watch the row transition:
```sql
SELECT status, "txSignature", slot, "blockTime"
FROM "ServiceRequest" WHERE id = '<serviceRequestId>';
```

- **Expected transitions:** `STAGED → IN_PROGRESS → CONFIRMED`.
- **Expected final row:** `status = CONFIRMED`, with `txSignature`, `slot`, and
  `blockTime` all populated.
- **Verify on Solscan (devnet):**
  `https://solscan.io/tx/<txSignature>?cluster=devnet` — the transaction shows a
  small rent-exempt transfer to the recipient + a Memo instruction. Confirm the
  cluster is **devnet** (never mainnet).

| Result | |
|---|---|
| Final status | |
| `txSignature` populated | |
| `slot` / `blockTime` populated | |
| Solscan (devnet) shows tx + memo | |

---

## 6. Notice page

Open the public notice cover sheet (no auth required, unguessable token):

```
https://STAGING_HOST/n/<noticeToken>
```

- **Expected cover sheet fields:**
  - Case caption
  - Plaintiff
  - Defendant
  - **Truncated** recipient wallet (first 4 … last 4; full value in hover title)
  - Service date in **UTC** (derived from on-chain `blockTime`)
  - **Solscan (devnet)** link to the transaction
  - Facilitation-safe disclaimer — "facilitates service … does not itself effect
    valid legal service".
- **First-access email:** if `RESEND_API_KEY` is configured and the org has an
  `ownerEmail`, the **first** view fires a "Notice viewed" alert. Confirm receipt
  (masked IP + UTC timestamp + notice URL in the body). Repeat views must **not**
  re-send.

| Result | |
|---|---|
| Caption / parties render | |
| Wallet truncated (full in title) | |
| Service date in UTC | |
| Solscan link = devnet | |
| First-access email received | |

---

## 7. Certificate download

As an **authenticated** org member:

```bash
curl -s -D - -o /tmp/certificate.pdf \
  -b "__session=<clerk_session>" \
  https://STAGING_HOST/api/certificate/<serviceRequestId>
```

- **Expected:** `200`, `Content-Type: application/pdf`,
  `Content-Disposition: …filename="certificate-<serviceRequestId>.pdf"`, and a
  valid (`%PDF`) non-empty file.
- **Open the PDF and confirm it contains:**
  - Case reference (notice token) + caption
  - Served-document **SHA-256**
  - **txSignature** + **Solscan (devnet)** link
  - Slot / blockTime (UTC)
  - **First-viewed** timestamp (+ masked viewer IP) from the addendum
  - Facilitation-safe disclaimer.
- **Negative check:** the same request **without** a session must return `401`
  (auth is enforced server-side).

| Result | |
|---|---|
| HTTP status | |
| Content-Type / filename | |
| SHA-256 present | |
| txSignature + Solscan(devnet) present | |
| First-viewed timestamp present | |
| Unauthenticated → 401 | |

---

## 8. Rate limiting

The certificate route throttles **10 requests / IP / 60s** before auth runs.

```bash
for i in $(seq 1 11); do
  curl -s -o /dev/null -w "%{http_code} " \
    -b "__session=<clerk_session>" \
    https://STAGING_HOST/api/certificate/<serviceRequestId>
done; echo
```

- **Expected:** the first 10 return `200`; the **11th** returns `429` with a
  **`Retry-After`** header (seconds until the window resets).
- Inspect headers on the 11th:
  ```bash
  curl -s -D - -o /dev/null -b "__session=<clerk_session>" \
    https://STAGING_HOST/api/certificate/<serviceRequestId>
  ```

> Note: the limiter is per **client IP** as seen by the server. If staging sits
> behind a proxy/CDN, ensure `x-forwarded-for` is forwarded so the per-IP window
> is accurate; otherwise all testers may share one bucket.

| Result | |
|---|---|
| 11th request status | |
| `Retry-After` header present | |

---

## 9. Quota enforcement

Tier1's quota is **1 service request per period**. The first submission (Step 4)
consumed it.

1. As the same Tier1 org member, submit a **second** service request via
   `/dashboard/new` (or `POST /api/service-requests` with a fresh on-curve
   devnet recipient).

- **Expected:** `403` (`Quota exceeded`). The record is **not** staged and no
  quota beyond the tier limit is consumed.
- (Context: a missing/inactive subscription returns `402`; an over-limit but
  active plan returns `403`. Here we expect **403**.)

| Result | |
|---|---|
| 2nd submission HTTP status | |
| 2nd record NOT staged | |

---

## 10. Health check (post-test)

Re-run the health probe to confirm the app and DB are still healthy after the run:

```bash
curl -s https://STAGING_HOST/api/health
```

- **Expected:** `200` with `{ "status": "ok", "db": "ok", … }`.

| Result | |
|---|---|
| Status code | |
| `db` field | |

---

## Sign-off

- [ ] All 10 sections pass with no SEV-1/2 open.
- [ ] No facilitation-overclaiming copy observed (hard rule #6).
- [ ] All chain activity on **devnet** (hard rule #2).
- [ ] No real PII / document bytes leaked to logs or issues (hard rule #3).

**Tester:** _______________  **Date (UTC):** _______________
**Staging commit/SHA:** _______________  **Result:** ☐ PASS ☐ FAIL

---

## SEV-1/2 triage

Severity guide:
- **SEV-1** — blocks the happy path or violates a hard rule (e.g. health down,
  delivery never confirms, mainnet/live-key exposure, document bytes leaked,
  auth bypass).
- **SEV-2** — significant defect with a workaround (e.g. wrong cover-sheet field,
  rate limit off-by-one, email not sent, misleading legal copy).

| Severity | Description | Steps to reproduce | Expected | Actual | Status |
|---|---|---|---|---|---|
| | | | | | |
| | | | | | |
| | | | | | |
