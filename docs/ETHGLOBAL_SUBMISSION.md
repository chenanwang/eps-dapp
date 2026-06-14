# EPS — ETHGlobal NYC 2026 Submission (T108)

**Project:** EPS — E-Process Server
**Track:** Continuity (existing product, new multi-chain features built this weekend)
**Live app:** https://eps-dapp.vercel.app
**Repo:** https://github.com/matty33/eps-dapp
**Event:** https://ethglobal.com/events/newyork2026

## Summary

EPS turns service of legal process into court-ready, cryptographically-verifiable
proof. A filer submits a case and a recipient wallet; EPS delivers an on-chain
notice and generates a **Proof of Service Certificate** (PDF) that ties together the
delivery transaction, an ENS-resolved recipient, an immutable Hedera Consensus
Service record, and a Hedera Token Service NFT — no Solidity, no manual notarization.

> EPS *facilitates service of process and generates court-ready proof* — it does not
> itself "effect valid legal service." (See CLAUDE.md hard rule #6.)

### Flow

1. **Intake** — filer submits a case caption + recipient (wallet **or ENS name**).
   Server-side validation, quota metering, rate limiting, and request-size limits
   guard the endpoint.
2. **Pay** — Stripe Billing subscription (test mode); a signature-verified,
   idempotent webhook activates the org.
3. **Deliver** — the worker sends the on-chain notice (Solana devnet), records the
   delivery to **Hedera HCS**, and mints an **HTS NFT** receipt.
4. **Certify** — a PDF certificate is generated with the tx hash + explorer URL,
   ENS display name, HCS sequence number, HTS serial, document SHA-256, and a QR
   code, then emailed via Resend.

## Bounty targets ($37,500)

| Sponsor | Amount | Tracks targeted | Where in the code |
|---|---:|---|---|
| **ENS** | $20,000 | Integration · ENSIP-25 · ENSIP-26 · Best Use | `lib/ens/ENSResolver.ts`, `app/api/ens/resolve`, `app/api/ens/agent` |
| **Hedera** | $9,000 | HCS · HTS NFT (No Solidity) | `lib/hedera/HederaService.ts`, `lib/hedera/HederaAgentKit.ts` |
| **Dynamic** | $7,000 | Flow · Server Wallet · Best Use | `lib/payments/DynamicFlow.ts`, `lib/agents/DynamicServerWallet.ts` |
| **Unlink** | $1,500 | Privacy | `lib/payments/UnlinkPrivacy.ts` |

### Proof points for judges

- **ENS:** recipients may be entered as ENS names and are resolved to addresses at
  intake; the serving agent itself carries an ENS name (ENSIP-25/26). Try:
  `GET https://eps-dapp.vercel.app/api/ens/resolve?input=vitalik.eth`
- **Hedera — zero Solidity:** every Hedera interaction is via `@hashgraph/sdk` (HCS
  + HTS), no smart contracts. Verify: `find . -name "*.sol" -not -path "*/node_modules/*"`
  returns nothing. Proofs are viewable on the testnet mirror node.
- **Dynamic:** server wallet + payment flow integration behind the EPS agent.
- **Unlink:** privacy-preserving payment path.

### Pinned integration versions (from `package.json`)

| Package | Version |
|---|---|
| `@ensdomains/ensjs` | ^4.0.2 |
| `viem` | ^2.21.0 |
| `@hashgraph/sdk` | ^2.62.0 |
| `@hashgraph/hedera-agent-kit` | ^4.0.0 |
| `@dynamic-labs-wallet/node` | ^1.0.0 |
| `@dynamic-labs/sdk-api` | ^0.0.1045 |

## Demo video script (≈3 min)

1. **0:00 — Hook (15s).** "Serving legal papers today means a process server and a
   notarized affidavit. EPS makes the proof cryptographic and court-ready." Show the
   live app at https://eps-dapp.vercel.app.
2. **0:15 — Health + ENS (30s).** Hit `/api/health` (200, `status: ok`). Then
   `/api/ens/resolve?input=vitalik.eth` — show the resolved address. Call out the
   ENS bounty: recipients can be named, not just hex.
3. **0:45 — Intake (40s).** Submit a service request using an **ENS name** as the
   recipient. Show server-side validation rejecting a bad caption (pre-quota) and the
   request being staged.
4. **1:25 — Pay (25s).** Walk the Stripe test-mode checkout; show the webhook marking
   the org active (idempotent, signature-verified).
5. **1:50 — Deliver (40s).** Run the worker; show the Solana devnet tx in the
   explorer, the **HCS** message on the Hedera mirror node, and the **HTS NFT** serial.
   Emphasize: no Solidity anywhere.
6. **2:30 — Certificate (25s).** Open the generated PDF: tx hash + explorer URL, ENS
   display name, HCS sequence #, HTS serial, document SHA-256, QR code.
7. **2:55 — Close (15s).** Recap the four bounties and the one-sentence value prop.

## Verification checklist (judges can reproduce)

- [ ] `curl -s https://eps-dapp.vercel.app/api/health` → `{"status":"ok",...}`
- [ ] `curl -s "https://eps-dapp.vercel.app/api/ens/resolve?input=vitalik.eth"` →
      resolves to an address
- [ ] `find . -name "*.sol" -not -path "*/node_modules/*"` → no output (zero Solidity)
- [ ] `pnpm list @ensdomains/ensjs @hashgraph/sdk @hashgraph/hedera-agent-kit @dynamic-labs-wallet/node viem`
      → integrations present
- [ ] Screenshots populated under [`docs/screenshots/`](screenshots/README.md)

## Deployment

- **App:** Vercel — https://eps-dapp.vercel.app
- **Worker:** separate long-lived process (Railway/Render) — see
  [`WORKER_DEPLOYMENT.md`](WORKER_DEPLOYMENT.md). Vercel serverless functions cannot
  run the always-on poller.
- **Chains:** Solana **devnet** and Hedera **testnet** only — never mainnet
  (`assertNotMainnet()` guard; CLAUDE.md hard rule #2).

> **Human gate (T108 step 6.3):** making the repo public for the Hedera bounty
> requires explicit human approval — do not flip visibility autonomously.
