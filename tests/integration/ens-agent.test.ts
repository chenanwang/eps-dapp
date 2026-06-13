/**
 * Integration tests for GET /api/ens/agent (T103).
 * ENSResolver is mocked so the route never hits Ethereum mainnet.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { getAgentENSName, getAgentTextRecord } = vi.hoisted(() => ({
  getAgentENSName: vi.fn(),
  getAgentTextRecord: vi.fn(),
}));
vi.mock("@/lib/ens/ENSResolver", () => ({ getAgentENSName, getAgentTextRecord }));

import { GET } from "@/app/api/ens/agent/route";

let savedAddr: string | undefined;
beforeEach(() => {
  vi.clearAllMocks();
  savedAddr = process.env.EVM_APP_WALLET_ADDRESS;
  delete process.env.EVM_APP_WALLET_ADDRESS;
});
afterEach(() => {
  if (savedAddr === undefined) delete process.env.EVM_APP_WALLET_ADDRESS;
  else process.env.EVM_APP_WALLET_ADDRESS = savedAddr;
});

describe("GET /api/ens/agent", () => {
  it("returns 200 with full identity when the agent has an ENS name", async () => {
    process.env.EVM_APP_WALLET_ADDRESS = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";
    getAgentENSName.mockResolvedValue("eps-agent.eth");
    getAgentTextRecord.mockResolvedValue("Licensed process server");
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.agentENSName).toBe("eps-agent.eth");
    expect(body.agentHasENSIdentity).toBe(true);
    expect(body.ensipLinks.agentRegistry).toContain("ensip/25");
    expect(body.ensipLinks.agentTextRecords).toContain("ensip/26");
  });

  it("returns 200 with graceful fallback when no agent ENS name is configured", async () => {
    getAgentENSName.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.agentENSName).toBeNull();
    expect(body.agentHasENSIdentity).toBe(false);
    expect(body.credentials).toEqual({});
  });
});
