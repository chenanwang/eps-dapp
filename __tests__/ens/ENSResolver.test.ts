/**
 * Unit tests for lib/ens/ENSResolver.ts (T102).
 * The ensjs public client is mocked so no network calls are made.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const { getAddressRecord, getName, getTextRecord } = vi.hoisted(() => ({
  getAddressRecord: vi.fn(),
  getName: vi.fn(),
  getTextRecord: vi.fn(),
}));

vi.mock("@ensdomains/ensjs", () => ({
  createEnsPublicClient: () => ({ getAddressRecord, getName, getTextRecord }),
}));

import {
  resolveENS,
  getAgentENSName,
  getAgentTextRecord,
} from "@/lib/ens/ENSResolver";

const VITALIK = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.EVM_APP_WALLET_ADDRESS;
});

describe("resolveENS", () => {
  it("forward-resolves an ENS name to an address", async () => {
    getAddressRecord.mockResolvedValue({ value: VITALIK });
    const res = await resolveENS("vitalik.eth");
    expect(res.address).toBe(VITALIK);
    expect(res.displayName).toBe("vitalik.eth");
    expect(res.wasENSName).toBe(true);
    expect(getAddressRecord).toHaveBeenCalledWith({ name: "vitalik.eth" });
  });

  it("reverse-resolves an address to its primary name", async () => {
    getName.mockResolvedValue({ name: "vitalik.eth" });
    const res = await resolveENS(VITALIK);
    expect(res.address).toBe(VITALIK);
    expect(res.primaryName).toBe("vitalik.eth");
    expect(res.displayName).toBe("vitalik.eth");
    expect(res.wasENSName).toBe(false);
  });

  it("returns a neutral result for input that is neither a name nor an address", async () => {
    const res = await resolveENS("plainstring");
    expect(res.address).toBeNull();
    expect(res.wasENSName).toBe(false);
    expect(res.primaryName).toBeNull();
    expect(getAddressRecord).not.toHaveBeenCalled();
    expect(getName).not.toHaveBeenCalled();
  });

  it("fails gracefully (no throw) when the resolver errors", async () => {
    getAddressRecord.mockRejectedValue(new Error("rpc down"));
    const res = await resolveENS("broken.eth");
    expect(res.address).toBeNull();
    expect(res.wasENSName).toBe(true);
  });
});

describe("getAgentENSName", () => {
  it("returns null when no app wallet address is configured", async () => {
    expect(await getAgentENSName()).toBeNull();
  });

  it("returns the reverse-resolved name when configured", async () => {
    process.env.EVM_APP_WALLET_ADDRESS = VITALIK;
    getName.mockResolvedValue({ name: "eps-agent.eth" });
    expect(await getAgentENSName()).toBe("eps-agent.eth");
  });
});

describe("getAgentTextRecord", () => {
  it("returns the text record value", async () => {
    getTextRecord.mockResolvedValue("https://eps.example");
    expect(await getAgentTextRecord("eps-agent.eth", "url")).toBe(
      "https://eps.example",
    );
  });

  it("returns null when the lookup throws", async () => {
    getTextRecord.mockRejectedValue(new Error("nope"));
    expect(await getAgentTextRecord("eps-agent.eth", "url")).toBeNull();
  });
});
