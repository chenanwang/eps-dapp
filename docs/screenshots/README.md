# EPS Screenshots — ETHGlobal NYC 2026 Submission

Drop submission screenshots in this directory. Each one backs a specific bounty
claim in the root `README.md` — capture them against the live demo (or a local
`pnpm dev` run with seeded data) and reference them from the submission.

## Required screenshots

| File | What it shows | Backs bounty |
|------|---------------|--------------|
| `01-landing.png` | EPS landing page + value prop | Continuity |
| `02-dashboard.png` | Authenticated dashboard with a services list | Core product |
| `03-service-request-form.png` | New service-request form (`/dashboard/new`) | Core product |
| `04-ens-resolution.png` | Live ENS resolution in the form (e.g. `vitalik.eth` → address) | **ENS** |
| `05-ens-certificate.png` | PDF certificate showing the ENS name on the proof | **ENS** |
| `06-hedera-hcs.png` | HCS proof-of-service message on the Hedera mirror node | **Hedera** |
| `07-hedera-hts-nft.png` | HTS NFT receipt for a delivery on the mirror node | **Hedera** |
| `08-dynamic-pay-crypto.png` | "Pay with Crypto" tab / Dynamic Flow fee acceptance | **Dynamic** |
| `09-dynamic-server-wallet.png` | MPC server wallet (agent) detail | **Dynamic** |
| `10-unlink-privacy.png` | Private fee payment via Unlink `deposit()` | **Unlink** |
| `11-solana-explorer.png` | Finalized delivery tx (memo) on a Solana explorer | Multi-chain core |
| `12-proof-certificate.png` | Full court-ready Proof of Service Certificate PDF | Core product |

## Conventions

- PNG, ≥ 1440px wide, light mode.
- Redact any real PII in case captions — use seed/test data only.
- Mirror-node and explorer shots should include the visible URL so reviewers can
  independently verify the on-chain artifact.

## Verify on-chain artifacts

- Hedera (HCS/HTS): https://testnet.mirrornode.hedera.com
- Solana (devnet): https://explorer.solana.com/?cluster=devnet
