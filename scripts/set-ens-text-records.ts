// scripts/set-ens-text-records.ts
// Publish the EPS agent's ENSIP-25 / ENSIP-26 text records on its ENS name.
//
// Sets the standard agent registry + credential records on `youhavebeenserved.eth`
// (override with AGENT_ENS_NAME) so that GET /api/ens/agent reports
// ensip25Compliant: true and ensip26Compliant: true.
//
// Usage:
//   pnpm tsx scripts/set-ens-text-records.ts
//
// Requires in .env.local (or the environment):
//   EVM_APP_WALLET_PRIVATE_KEY  — the key that OWNS / is the manager of the ENS name
//   EVM_RPC_ETH_MAINNET         — an Ethereum *mainnet* RPC URL
//   AGENT_ENS_NAME              — optional; defaults to youhavebeenserved.eth
//
// SAFETY: this writes on Ethereum mainnet and costs gas. It only ever calls
// `setText` on the name's own resolver — it cannot transfer the name or funds.

// Load .env.local via Node's built-in env-file loader (no dotenv dependency).
try { process.loadEnvFile('.env.local'); } catch { /* .env.local is optional */ }

import { createWalletClient, createPublicClient, http, namehash, getContract } from 'viem';
import { mainnet } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import { normalize } from 'viem/ens';

const AGENT_ENS_NAME = process.env.AGENT_ENS_NAME ?? 'youhavebeenserved.eth';

// The ENSIP-25 (agent registry) + ENSIP-26 (text records) records EPS publishes.
const TEXT_RECORDS: Record<string, string> = {
  description: 'EPS – AI-powered legal process server with Hedera HCS proof and ENS identity',
  url: 'https://eps-dapp.vercel.app',
  'agent.category': 'legal',
  'agent.version': '1.0.0',
  'agent.did': `did:ens:${AGENT_ENS_NAME}`,
  'agent.endpoint': 'https://eps-dapp.vercel.app/api/agent',
};

// Minimal resolver ABI — only setText/text are needed here.
const RESOLVER_ABI = [
  {
    name: 'setText',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'node', type: 'bytes32' },
      { name: 'key', type: 'string' },
      { name: 'value', type: 'string' },
    ],
    outputs: [],
  },
  {
    name: 'text',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'node', type: 'bytes32' },
      { name: 'key', type: 'string' },
    ],
    outputs: [{ name: '', type: 'string' }],
  },
] as const;

async function main() {
  const pk = process.env.EVM_APP_WALLET_PRIVATE_KEY;
  const rpc = process.env.EVM_RPC_ETH_MAINNET;

  if (!pk) {
    console.error('Set EVM_APP_WALLET_PRIVATE_KEY in .env.local (owner/manager of the ENS name).');
    process.exit(1);
  }
  if (!rpc) {
    console.error('Set EVM_RPC_ETH_MAINNET in .env.local (an Ethereum mainnet RPC URL).');
    process.exit(1);
  }

  const account = privateKeyToAccount(pk.startsWith('0x') ? (pk as `0x${string}`) : (`0x${pk}` as `0x${string}`));
  const transport = http(rpc);
  const publicClient = createPublicClient({ chain: mainnet, transport });
  const walletClient = createWalletClient({ account, chain: mainnet, transport });

  const name = normalize(AGENT_ENS_NAME);
  const node = namehash(name);
  console.log(`Setting ENS text records on ${name}`);
  console.log(`  signer: ${account.address}`);

  // Resolve the name's current resolver contract.
  const resolverAddress = await publicClient.getEnsResolver({ name });
  if (!resolverAddress) {
    console.error(`No resolver set for ${name}. Set a resolver in the ENS app first.`);
    process.exit(1);
  }
  console.log(`  resolver: ${resolverAddress}`);

  const resolver = getContract({
    address: resolverAddress,
    abi: RESOLVER_ABI,
    client: { public: publicClient, wallet: walletClient },
  });

  for (const [key, value] of Object.entries(TEXT_RECORDS)) {
    try {
      const current = await resolver.read.text([node, key]);
      if (current === value) {
        console.log(`  = ${key} (already set, skipping)`);
        continue;
      }
      const hash = await resolver.write.setText([node, key, value]);
      console.log(`  → ${key} = "${value}"  (tx ${hash})`);
      await publicClient.waitForTransactionReceipt({ hash });
      console.log(`  ✓ ${key} confirmed`);
    } catch (err) {
      console.error(`  ✗ ${key} failed:`, err instanceof Error ? err.message : err);
    }
  }

  console.log('\nDone. Verify with: curl https://eps-dapp.vercel.app/api/ens/agent');
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
