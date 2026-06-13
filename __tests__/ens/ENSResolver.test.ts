/**
 * Unit tests for lib/ens/ENSResolver.ts (T102).
 *
 * `@ensdomains/ensjs` is mocked so the suite never opens a socket. The module
 * builds its `createEnsPublicClient` at import time, so the mock is registered
 * via `vi.hoisted` before the SUT import.
 *
 * NOTE: the task brief referred to `resolveAddress(...)` throwing an
 * `ENSResolutionError`. The actual module exports `resolveENS(...)` and is
 * deliberately non-throwing (graceful degradation — matches the codebase
 * pattern of never failing delivery on an optional integration). These tests
 * assert that real, shipped behaviour.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const VITALIK = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";

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

beforeEach(() => {
  getAddressRecord.mockReset();
  getName.mockReset();
  getTextRecord.mockReset();
});

afterEach(() => {
  delete process.env.EVM_APP_WALLET_ADDRESS;
});

describe("resolveENS — forward (name → address)", () => {
  it("resolves 'vitalik.eth' to its address record", async () => {
    getAddressRecord.mockResolvedValue({ value: VITALIK });

    const res = await resolveENS("vitalik.eth");

    expect(getAddressRecord).toHaveBeenCalledWith({ name: "vitalik.eth" });
    expect(res).toEqual({
      address: VITALIK,
      displayName: "vitalik.eth",
      wasENSName: true,
      primaryName: null,
    });
  });

  it("returns a null address (never throws) when the lookup rejects", async () => {
    getAddressRecord.mockRejectedValue(new Error("rpc down"));

    const res = await resolveENS("doesnotexist.eth");

    expect(res.address).toBeNull();
    expect(res.wasENSName).toBe(true);
  });
});

describe("resolveENS — reverse (address → primary name)", () => {
  it("returns the primary name for an EVM address", async () => {
    getName.mockResolvedValue({ name: "vitalik.eth" });

    const res = await resolveENS(VITALIK);

    expect(getName).toHaveBeenCalledWith({ address: VITALIK });
    expect(res).toEqual({
      address: VITALIK,
      displayName: "vitalik.eth",
      wasENSName: false,
      primaryName: "vitalik.eth",
    });
  });

  it("falls back to the raw address as displayName when there is no primary name", async () => {
    getName.mockResolvedValue({ name: null });

    const res = await resolveENS(VITALIK);

    expect(res.displayName).toBe(VITALIK);
    expect(res.primaryName).toBeNull();
  });
});

describe("resolveENS — unresolvable input", () => {
  it("returns a null/echo result for input that is neither an address nor a name", async () => {
    const res = await resolveENS("notanens");

    expect(getAddressRecord).not.toHaveBeenCalled();
    expect(getName).not.toHaveBeenCalled();
    expect(res).toEqual({
      address: null,
      displayName: "notanens",
      wasENSName: false,
      primaryName: null,
    });
  });
});

describe("getAgentENSName", () => {
  it("returns null when EVM_APP_WALLET_ADDRESS is unset", async () => {
    expect(await getAgentENSName()).toBeNull();
    expect(getName).not.toHaveBeenCalled();
  });

  it("reverse-resolves the configured agent wallet address", async () => {
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
    expect(getTextRecord).toHaveBeenCalledWith({ name: "eps-agent.eth", key: "url" });
  });

  it("returns null when the text-record lookup throws", async () => {
    getTextRecord.mockRejectedValue(new Error("boom"));

    expect(await getAgentTextRecord("eps-agent.eth", "url")).toBeNull();
  });
});
