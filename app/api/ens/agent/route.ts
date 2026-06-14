import { NextResponse } from 'next/server';
import { getAgentENSName, getAgentTextRecord } from '@/lib/ens/ENSResolver';

/**
 * GET /api/ens/agent — the EPS agent's on-chain ENS identity (ENSIP-25 / ENSIP-26).
 *
 * Resolves the agent wallet's primary ENS name and reads the standard agent text
 * records set by `scripts/set-ens-text-records.ts`:
 *   description, url, agent.category, agent.version, agent.did, agent.endpoint
 *
 * ENSIP-25 (agent registry) compliance is asserted when the agent resolves to an
 * ENS name AND publishes the agent.* registry records. ENSIP-26 (verifiable
 * credentials / text records) compliance is asserted when the descriptive
 * credential records (description + url) are present. Every text-record read is
 * isolated (Promise.allSettled) so one missing key never fails the whole probe.
 */

const TEXT_KEYS = [
  'description',
  'url',
  'agent.category',
  'agent.version',
  'agent.did',
  'agent.endpoint',
] as const;

export async function GET() {
  const agentAddress = process.env.EVM_APP_WALLET_ADDRESS ?? null;
  const agentENSName = await getAgentENSName();

  const textRecords: Record<string, string | null> = {};
  for (const key of TEXT_KEYS) textRecords[key] = null;

  if (agentENSName) {
    const results = await Promise.allSettled(
      TEXT_KEYS.map((key) => getAgentTextRecord(agentENSName, key)),
    );
    TEXT_KEYS.forEach((key, i) => {
      const r = results[i];
      textRecords[key] = r.status === 'fulfilled' ? r.value : null;
    });
  }

  const hasAgentRegistryRecords =
    !!textRecords['agent.category'] || !!textRecords['agent.did'];
  const hasCredentialRecords = !!textRecords['description'] || !!textRecords['url'];

  const agentHasENSIdentity = !!agentENSName;
  const ensip25Compliant = agentHasENSIdentity && hasAgentRegistryRecords;
  const ensip26Compliant = agentHasENSIdentity && hasCredentialRecords;

  return NextResponse.json({
    ensName: agentENSName,
    agentAddress,
    agentENSName,
    agentHasENSIdentity,
    ensip25Compliant,
    ensip26Compliant,
    textRecords,
    ensipLinks: {
      agentRegistry: 'https://docs.ens.domains/ensip/25/',
      agentTextRecords: 'https://docs.ens.domains/ensip/26/',
    },
  });
}
