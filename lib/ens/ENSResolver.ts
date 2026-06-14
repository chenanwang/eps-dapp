/**
 * lib/ens/ENSResolver.ts
 * ENS resolution for EPS — 4 prize tracks, $20,000 total.
 * SDK: @ensdomains/ensjs
 * SERVER-SIDE ONLY.
 */
import { http } from 'viem';
import { mainnet } from 'viem/chains';
import { createEnsPublicClient } from '@ensdomains/ensjs';

const RPC_URL = process.env.EVM_RPC_ETH_MAINNET ?? 'https://eth.llamarpc.com';

// Startup sanity check: a missing or placeholder RPC URL silently breaks every
// ENS lookup (resolution returns null with a 200), so surface it loudly in logs.
if (!process.env.EVM_RPC_ETH_MAINNET) {
  console.warn(
    '[ENSResolver] EVM_RPC_ETH_MAINNET is not set — falling back to public RPC ' +
      '(https://eth.llamarpc.com), which may be rate-limited. Set a dedicated mainnet RPC URL.',
  );
} else if (/YOUR_API_KEY|<.*>|sepolia|goerli|holesky/i.test(RPC_URL)) {
  console.warn(
    '[ENSResolver] EVM_RPC_ETH_MAINNET looks like a placeholder or non-mainnet URL: ' +
      `"${RPC_URL}". ENS lookups require a valid Ethereum *mainnet* RPC endpoint.`,
  );
}

const ensClient = createEnsPublicClient({
  chain: mainnet,
  transport: http(RPC_URL),
});

export interface ENSResolution {
  address:     string | null;
  displayName: string;
  wasENSName:  boolean;
  primaryName: string | null;
}

export async function resolveENS(input: string): Promise<ENSResolution> {
  const trimmed = input.trim();
  const isEvmAddress = /^0x[0-9a-fA-F]{40}$/.test(trimmed);
  const isName = !isEvmAddress && trimmed.includes('.');

  if (isName) {
    try {
      const result = await ensClient.getAddressRecord({ name: trimmed });
      return { address: result?.value ?? null, displayName: trimmed, wasENSName: true, primaryName: null };
    } catch (err) {
      console.error(`[ENSResolver] forward resolution failed for "${trimmed}" via ${RPC_URL}:`, err);
      return { address: null, displayName: trimmed, wasENSName: true, primaryName: null };
    }
  }

  if (isEvmAddress) {
    try {
      const result = await ensClient.getName({ address: trimmed as `0x${string}` });
      const name = result?.name ?? null;
      return { address: trimmed, displayName: name ?? trimmed, wasENSName: false, primaryName: name };
    } catch (err) {
      console.error(`[ENSResolver] reverse resolution failed for "${trimmed}" via ${RPC_URL}:`, err);
      return { address: trimmed, displayName: trimmed, wasENSName: false, primaryName: null };
    }
  }

  return { address: null, displayName: trimmed, wasENSName: false, primaryName: null };
}

export async function getAgentENSName(): Promise<string | null> {
  const addr = process.env.EVM_APP_WALLET_ADDRESS;
  if (!addr || !/^0x[0-9a-fA-F]{40}$/.test(addr)) return null;
  try {
    const result = await ensClient.getName({ address: addr as `0x${string}` });
    return result?.name ?? null;
  } catch (err) {
    console.error(`[ENSResolver] agent name lookup failed for "${addr}" via ${RPC_URL}:`, err);
    return null;
  }
}

export async function getAgentTextRecord(ensName: string, key: string): Promise<string | null> {
  try {
    const result = await ensClient.getTextRecord({ name: ensName, key });
    return result ?? null;
  } catch (err) {
    console.error(`[ENSResolver] text record lookup failed for "${ensName}" key "${key}" via ${RPC_URL}:`, err);
    return null;
  }
}
