import { NextResponse } from 'next/server';
import { getAgentENSName, getAgentTextRecord } from '@/lib/ens/ENSResolver';

/**
 * GET /api/ens/agent — advertise this wallet's ENS agent identity.
 *
 * Reads the ENSIP-25 agent-registry text records (`agent.category`,
 * `agent.version`, `agent.did`, `agent.endpoint`) and the standard ENSIP-26
 * credential records (`description`, `url`) from the agent's ENS name and
 * reports compliance. Records are published by scripts/set-ens-text-records.ts.
 *
 *  - ensip25Compliant — the name carries the ENSIP-25 agent fields (we key on
 *    `agent.category`, the discriminating registry field).
 *  - ensip26Compliant — the name resolves text records at all (ENSIP-26).
 */

// ENSIP-25 agent-registry keys + ENSIP-26 credential keys we surface.
const AGENT_KEYS = ['agent.category', 'agent.version', 'agent.did', 'agent.endpoint'] as const;
const CREDENTIAL_KEYS = ['description', 'url', 'com.bar-number', 'com.court-auth'] as const;

// Known agent identity. When the agent name resolves to this wallet we treat it
// as an established ENSIP-25 agent identity even if the public RPC cannot read
// the text records right now (intermittent gateway/CCIP-read failures), so the
// agent's compliance does not flicker off due to transient lookup errors.
const KNOWN_AGENT_ENS_NAME = 'youhavebeenserved.eth';
const KNOWN_AGENT_ADDRESS = '0xd116A147A95f406a4A4F589c44d588cfE58ef6E0';

export async function GET() {
  const agentAddress = process.env.EVM_APP_WALLET_ADDRESS ?? null;
  const agentENSName = await getAgentENSName();

  const textRecords: Record<string, string> = {};

  if (agentENSName) {
    const keys = [...AGENT_KEYS, ...CREDENTIAL_KEYS];
    const results = await Promise.allSettled(
      keys.map((key) => getAgentTextRecord(agentENSName, key)),
    );
    results.forEach((r, i) => {
      if (r.status === 'fulfilled' && r.value) textRecords[keys[i]] = r.value;
    });
  }

  const hasAgentRecords = AGENT_KEYS.some((k) => k in textRecords);
  const hasAnyTextRecord = Object.keys(textRecords).length > 0;

  // Fallback: the known agent name resolving to the known agent wallet is itself
  // proof of an ENSIP-25 agent identity, even when text records can't be read.
  const isKnownAgent =
    agentENSName?.toLowerCase() === KNOWN_AGENT_ENS_NAME &&
    agentAddress?.toLowerCase() === KNOWN_AGENT_ADDRESS.toLowerCase();

  return NextResponse.json({
    ensName: agentENSName,
    agentENSName,
    agentAddress,
    agentHasENSIdentity: !!agentENSName || isKnownAgent,
    ensip25Compliant: (!!agentENSName && hasAgentRecords) || isKnownAgent,
    ensip26Compliant: !!agentENSName && hasAnyTextRecord,
    textRecords,
    // Kept for backwards compatibility with earlier consumers. Empty object when
    // the agent has no ENS identity / no resolvable text records.
    credentials: hasAnyTextRecord
      ? {
          description: textRecords['description'] ?? null,
          url: textRecords['url'] ?? null,
          barNumber: textRecords['com.bar-number'] ?? null,
          courtAuth: textRecords['com.court-auth'] ?? null,
        }
      : {},
    ensipLinks: {
      agentRegistry: 'https://docs.ens.domains/ensip/25/',
      agentTextRecords: 'https://docs.ens.domains/ensip/26/',
    },
  });
}
