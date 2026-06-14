// scripts/create-hedera-nft.ts
// Create the EPS "Proof of Service" NFT collection on Hedera HTS (run once).
//
// After this prints a token id, set it in your environment / Vercel as
// HEDERA_NFT_TOKEN_ID so HederaService.mintProofNFT() can mint a receipt for
// each delivered service request (Section 5).
//
// Usage:
//   pnpm tsx scripts/create-hedera-nft.ts
//
// Requires in .env.local (or the environment):
//   HEDERA_OPERATOR_ID   — e.g. 0.0.xxxxx (also becomes treasury + supply key)
//   HEDERA_OPERATOR_KEY   — DER-encoded private key for the operator
//   HEDERA_NETWORK        — "testnet" (default) or "mainnet"

// Load .env.local via Node's built-in env-file loader (no dotenv dependency).
try { process.loadEnvFile('.env.local'); } catch { /* .env.local is optional */ }

// This file uses only dynamic import(), so mark it a module to keep `main` in
// module scope (avoids a global-scope collision with other one-off scripts).
export {};

async function main() {
  const operatorId = process.env.HEDERA_OPERATOR_ID;
  const operatorKey = process.env.HEDERA_OPERATOR_KEY;
  if (!operatorId || !operatorKey) {
    console.error('Set HEDERA_OPERATOR_ID and HEDERA_OPERATOR_KEY in .env.local first.');
    process.exit(1);
  }

  if (process.env.HEDERA_NFT_TOKEN_ID) {
    console.log(
      `HEDERA_NFT_TOKEN_ID is already set (${process.env.HEDERA_NFT_TOKEN_ID}). ` +
        'Delete it from your env if you intend to create a new collection.',
    );
  }

  const { Client, PrivateKey, TokenCreateTransaction, TokenType, TokenSupplyType } =
    await import('@hashgraph/sdk');

  const network = process.env.HEDERA_NETWORK === 'mainnet' ? 'mainnet' : 'testnet';
  const client = network === 'mainnet' ? Client.forMainnet() : Client.forTestnet();
  const key = PrivateKey.fromStringDer(operatorKey);
  client.setOperator(operatorId, key);

  console.log(`Creating EPS Proof-of-Service NFT collection on Hedera ${network}...`);
  try {
    const tx = await new TokenCreateTransaction()
      .setTokenName('EPS Proof of Service')
      .setTokenSymbol('EPSPOS')
      .setTokenType(TokenType.NonFungibleUnique)
      .setSupplyType(TokenSupplyType.Infinite)
      .setTreasuryAccountId(operatorId)
      .setSupplyKey(key)
      .setInitialSupply(0)
      .execute(client);

    const receipt = await tx.getReceipt(client);
    const tokenId = receipt.tokenId?.toString();
    client.close();

    if (!tokenId) {
      console.error('Token creation returned no token id.');
      process.exit(1);
    }

    console.log('\nSUCCESS. Add this to your environment (and Vercel):');
    console.log(`HEDERA_NFT_TOKEN_ID=${tokenId}`);
    console.log(`\nView it: https://hashscan.io/${network}/token/${tokenId}`);
  } catch (err) {
    client.close();
    console.error('Token creation failed:', err);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
