# Scope of Work — BLI E-Process Server (EPS) dApp
## v1.1 — Reconciles the Web3 Document Delivery SOW (v1/MVP) with the DARA E-Process Server product page

**Product:** Service of legal process (summons/complaint) delivered to a defendant's blockchain wallet as a verifiable, timestamped, court-ready on-chain record, with link-access tracking and a Proof of Service Certificate.
**Reference page:** https://dara.foundation/the-blockchain-legal-institute-e-process-server/
**Base document:** web3-document-delivery-SOW (v1/MVP)
**Posture:** Custodial — law firms never touch crypto. The app's DARA wallet performs all on-chain work, funded by subscription revenue.

---

## 1. What changes from the Delivery SOW (the delta)

The Delivery SOW is the correct engineering skeleton. The E-Process Server page adds five product requirements that change the design:

| # | Page requirement | Delivery-SOW v1 behavior | EPS v1.1 decision |
|---|---|---|---|
| D1 | "Secure encrypted portal" for legal documents | File public on IPFS, consent checkbox | **Documents are NOT public.** Files stored encrypted at rest in app object storage (S3/Supabase Storage, AES-256, server-side keys). On-chain record carries SHA-256 + tokenized notice URL — never the document itself. Public IPFS pinning is removed from the critical path (optional encrypted-blob pin in v1.5). The consent checkbox is replaced by a **process-server attestation checkbox** (filer attests authority to serve). |
| D2 | "Secure hyperlink … link-access tracking" → "Notice Link Accessed ✓ Confirmed" on certificate | Not present | **Tracked Notice Link.** Each service generates a unique unguessable URL (`/n/<token>`). Every access is logged (UTC timestamp, IP, user agent, geolocation-by-IP). First-access confirmation appears on the certificate and triggers an email to the filer. The page renders a legal-notice cover sheet + document viewer/download. |
| D3 | "Mints a service token … airdropped … cannot be blocked or refused" | SOL transfer + Memo | **Phased.** v1 anchor = SystemProgram.transfer(rent-exempt min) + Memo(`sha256:<hash> | notice:<short-url> | svc:<recordId>`) — cheapest, unblockable, sufficient for proof. v1.5 = additionally mint a **Token-2022 NFT** ("Service Token") with metadata pointing to the notice URL, airdropped to the recipient ATA, so the notice is visible inside the defendant's wallet UI (matches LCX-style NFT service and the page's language). Both behind the existing `ChainAdapter`. |
| D4 | "Court-Ready Proof of Service Certificate" with TXID, wallet, timestamp, link-access | Email receipt only | **Certificate generator.** Server-side PDF: case caption fields (court, cause no., parties), document name + SHA-256, recipient wallet address, TXID + explorer link, slot + blockTime (UTC), notice URL, access log table, and a **declaration block** (28 U.S.C. § 1746 / state-equivalent unsworn declaration) for the process server or attorney to execute. Stored, downloadable from dashboard, attached to receipt email. |
| D5 | Subscription tiers ($200/$600/$1,000/mo), promo code EARLYADOPTER50, Founders' Legacy comp accounts | Flat per-delivery fee via Checkout | **Stripe Billing (subscriptions)** with metered session quotas: Tier 1 = 1 service/mo, Tier 2 = 2–9, Tier 3 = 10+. Promotion code support (50% first year). Admin-grantable comp plans (Founders' Legacy, 24-month, any tier). Quota enforced at submission time; overage either blocked (v1) or billed per-session (v1.5). |

Everything else in the Delivery SOW carries forward unchanged: Solana devnet first, single custodial hot wallet (key in KMS), async worker on a DB-polled job table, status machine with idempotent steps, Clerk auth, Postgres/Prisma, Resend email, Next.js App Router.

## 2. Revised data model

**Service** (extends prior record):
`id, orgId, userId, status, caseCaption{court, causeNo, plaintiff, defendant}, recipientAddress, fileName, fileSha256, fileSize, storageKey, encryptionKeyRef, noticeToken, noticeUrl, chain, txSignature, slot, blockTime, serviceTokenMint (v1.5), certificatePdfKey, attestationAccepted, retryCount, errorMessage, createdAt, updatedAt`

**New tables:**
- `Organization` — law firm; Stripe customer id; plan tier; period quota; comp flag/expiry.
- `NoticeAccess` — `serviceId, accessedAt(UTC), ip, userAgent, geoCountry, geoRegion, isFirstAccess`.
- `Subscription` — Stripe sub id, price id, status, currentPeriodStart/End, sessionsUsedThisPeriod.
- `AuditLog` — append-only: who/what/when for every state transition (court-defensibility).

**Status machine:** `CREATED → QUOTA_OK → STAGED → DELIVERING → DELIVERED → VERIFIED → CERTIFIED → NOTIFIED` (+ `FAILED`). (Payment leaves the per-service path — quota check replaces the per-delivery Checkout step; Stripe Billing webhooks maintain the org's quota state.)

## 3. Revised flow

**A. Account & subscription** — Clerk signup (email verify + 2FA) → create Organization → Stripe Checkout in subscription mode (promo code field) → webhook `customer.subscription.created/updated` sets tier + quota. Admin route grants comp plans.

**B. Submit service (synchronous)** — Upload PDF summons/complaint (≤25 MB, MIME + magic-byte checked) → enter recipient address (base58 + on-curve validation), case caption fields, optional note → tick process-server attestation → backend: quota check → SHA-256 → encrypt + store → mint notice token URL → create Service (`STAGED`) → enqueue. Returns immediately to a status page.

**C. Fulfil (worker)** — Build tx (transfer + memo) → send → **persist signature before confirming** → confirm at `finalized` → store slot/blockTime (`DELIVERED`) → re-read tx, verify recipient + memo hash match (`VERIFIED`) → generate certificate PDF (`CERTIFIED`) → Resend email with certificate + dashboard link (`NOTIFIED`). v1.5 inserts NFT mint+airdrop between send and certify.

**D. Notice access (any time after DELIVERED)** — Recipient (or anyone with the link) opens `/n/<token>` → access logged → first access updates the certificate addendum ("Notice Link Accessed ✓ Confirmed — <UTC>") and emails the filer.

## 4. Failure & idempotency (carried + extended)
- Status written before/after every step; retryCount/errorMessage recorded; AuditLog row per transition.
- Signature persisted pre-confirmation → retries re-confirm, never re-send. Durable nonce in v2.
- Terminal failure: restore the quota session, set `FAILED`, surface on dashboard, alert ops. (No Stripe refund needed in the subscription model unless comp/overage billing is involved.)
- Webhooks signature-verified and event-id deduped.

## 5. Legal/compliance notes (build-relevant)
- Certificate language aligned to **LCX AG v. John Doe Nos. 1–25** (N.Y. Sup. Ct. 2022, NFT service "good and sufficient") and the UK High Court's *D'Aloia* line; certificate is formatted as an exhibit-ready unsworn declaration. (Counsel review required before production use — flag in launch checklist.)
- The app **facilitates** service; the filer of record executes the declaration. UI copy must never state that the platform itself "effects valid service" — jurisdiction-dependent and usually requires a court order authorizing alternative service. Add a court-order-on-file checkbox (optional field, stored).
- Document confidentiality: tracked link is unauthenticated by design (defendant has no account) but unguessable (128-bit token), rate-limited, optional expiry. This is the standard the LCX mechanism used.

## 6. Out of scope v1
Encryption key-claim by recipient wallet, multi-chain (ETH/BTC), per-firm wallets, admin panel beyond comp grants, the "Red Flag" AI/consortium analytics layer (separate product), invoicing/tax, overage billing.

## 7. v1.5 / v2 ladder
1. Token-2022 NFT Service Token airdrop (wallet-visible notice). 2. Public verification page (paste TXID → re-derive + match hash). 3. Overage billing. 4. ETH Sepolia + BTC OP_RETURN via ChainAdapter. 5. Durable nonce. 6. Recipient key-claim decryption. 7. Red-Flag analytics consortium feed.
