/**
 * lib/agents/DynamicServerWallet.ts
 * Dynamic MPC server wallet for the EPS delivery agent.
 * Prize: Best Agentic Build ($2,000).
 * Package: @dynamic-labs-wallet/node-evm (V1 SDK — DynamicEvmWalletClient).
 * SERVER-SIDE ONLY.
 */

import { DynamicEvmWalletClient } from '@dynamic-labs-wallet/node-evm';
import { ThresholdSignatureScheme } from '@dynamic-labs-wallet/node';

export interface AgentWalletInfo {
  walletId: string;
  address:  string;
}

export async function createAgentWallet(): Promise<AgentWalletInfo | null> {
  const authToken     = process.env.DYNAMIC_BEARER_TOKEN;
  const environmentId = process.env.NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID;

  if (!authToken || !environmentId) {
    console.error('[DynamicAgent] Missing DYNAMIC_BEARER_TOKEN or NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID');
    return null;
  }

  try {
    const client = new DynamicEvmWalletClient({ environmentId });
    await client.authenticateApiToken(authToken);

    const { walletMetadata, publicKeyHex } = await client.createWalletAccount({
      thresholdSignatureScheme: ThresholdSignatureScheme.TWO_OF_TWO,
      password:                 process.env.DYNAMIC_WALLET_PASSWORD ?? 'eps-agent-secure-pw-2026',
      onError: (error: Error) => console.error('[DynamicAgent] Error:', error),
      backUpToDynamic:          true,
    });

    const walletId = walletMetadata?.walletId ?? 'unknown';
    const address  = walletMetadata?.accountAddress ?? publicKeyHex ?? 'unknown';

    console.log(`[DynamicAgent] Wallet created: ${walletId} | Address: ${address}`);
    console.log(`[DynamicAgent] ADD TO .env.local → EPS_AGENT_WALLET_ID=${walletId}`);

    return { walletId, address };
  } catch (err) {
    console.error('[DynamicAgent] createAgentWallet failed:', err);
    return null;
  }
}
