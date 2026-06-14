// scripts/create-hedera-nft.ts — Hedera HTS proof-of-service NFT ROUND-TRIP.
//
// Mints one proof-of-service NFT and TRANSFERS it to a demo defendant account on
// Hedera testnet, then writes the result to `bounty/hedera-proof.json`. This is
// the real on-chain token transfer the Hedera "AI & Agentic Payments" bounty
// requires (issue #148, Fix 4) — an HCS message alone does not qualify.
//
// Reuses an existing collection (HEDERA_NFT_TOKEN_ID) when set, otherwise creates
// one. Reuses HEDERA_DEMO_DEFENDANT_ID when set, otherwise creates a fresh
// testnet account (with unlimited auto-association) and logs its id.
//
// Requires (read from env — never hard-coded, CLAUDE.md hard rule #1):
//   HEDERA_OPERATOR_ID   — e.g. 0.0.xxxxx (operator = treasury + supply key)
//   HEDERA_OPERATOR_KEY  — DER-encoded private key
//   HEDERA_NETWORK       — "testnet" (default) or "mainnet"
// Optional:
//   HEDERA_NFT_TOKEN_ID, HEDERA_DEMO_DEFENDANT_ID, HEDERA_HCS_TOPIC_ID
//
// Run:
//   pnpm tsx scripts/create-hedera-nft.ts
//
// Guard: refuses to run against mainnet unless HEDERA_ALLOW_MAINNET=true.

try { process.loadEnvFile('.env.local'); } catch { /* .env.local is optional */ }

import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { mintAndTransferProofNFT } from '../lib/hedera/mintAndTransferProofNFT';

async function main() {
  if (!process.env.HEDERA_OPERATOR_ID || !process.env.HEDERA_OPERATOR_KEY) {
    throw new Error('HEDERA_OPERATOR_ID and HEDERA_OPERATOR_KEY must be set.');
  }

  const network = process.env.HEDERA_NETWORK === 'mainnet' ? 'mainnet' : 'testnet';
  const hcsTopicId = process.env.HEDERA_HCS_TOPIC_ID ?? '0.0.9225885';

  console.log(`Minting + transferring proof-of-service NFT on Hedera ${network}…`);

  const result = await mintAndTransferProofNFT({
    caseId: 'roundtrip-demo',
    hcsTopicId,
  });

  if (!result) {
    throw new Error('mintAndTransferProofNFT returned null — credentials missing.');
  }

  const mintTimestamp = new Date().toISOString();
  const proof = {
    network,
    htsTokenId: result.tokenId,
    htsNftSerial: result.serial,
    htsTransferTx: result.transferTx,
    defendantAccount: result.defendantId,
    defendantCreated: result.defendantCreated,
    hcsTopicId,
    mintTimestamp,
    hashscanNFT: `https://hashscan.io/${network}/token/${result.tokenId}`,
    hashscanTransfer: `https://hashscan.io/${network}/transaction/${result.transferTx}`,
    hashscanTopic: `https://hashscan.io/${network}/topic/${hcsTopicId}`,
    hashscanDefendant: `https://hashscan.io/${network}/account/${result.defendantId}`,
  };

  const outDir = join(process.cwd(), 'bounty');
  mkdirSync(outDir, { recursive: true });
  const outFile = join(outDir, 'hedera-proof.json');
  writeFileSync(outFile, JSON.stringify(proof, null, 2) + '\n');

  console.log('\n✓ Round-trip complete. Wrote bounty/hedera-proof.json:\n');
  console.log(JSON.stringify(proof, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
