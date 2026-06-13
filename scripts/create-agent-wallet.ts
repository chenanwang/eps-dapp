// scripts/create-agent-wallet.ts — run once: npx tsx scripts/create-agent-wallet.ts
// Load .env.local via Node's built-in env-file loader (no dotenv dependency).
try { process.loadEnvFile('.env.local'); } catch { /* .env.local is optional */ }
import { createAgentWallet } from '../lib/agents/DynamicServerWallet';

async function main() {
  if (!process.env.DYNAMIC_WALLET_PASSWORD) {
    console.error('Set DYNAMIC_WALLET_PASSWORD in .env.local first');
    process.exit(1);
  }
  const wallet = await createAgentWallet();
  if (wallet) {
    console.log('\nSUCCESS. Add to .env.local:');
    console.log(`EPS_AGENT_WALLET_ID=${wallet.walletId}`);
  } else {
    console.log('\nFAILED. Check Dynamic credentials and docs:');
    console.log('https://www.dynamic.xyz/docs/node/wallets/server-wallets/overview');
  }
}
main().catch(console.error);
