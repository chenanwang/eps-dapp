/**
 * Unit tests for lib/chain/EVMAdapter.ts (T102).
 * Exercises pure, network-free behaviour: address validation and the
 * constructor guard for unknown chain ids.
 */
import { describe, it, expect } from "vitest";
import { EVMAdapter } from "@/lib/chain/EVMAdapter";
import { ChainId, ChainError } from "@/lib/chain/ChainAdapter";

const VALID = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";

describe("EVMAdapter.validateAddress", () => {
  const adapter = new EVMAdapter(ChainId.ETH_SEPOLIA);

  it("accepts a well-formed 0x EVM address", () => {
    expect(adapter.validateAddress(VALID)).toEqual({ valid: true });
  });

  it("rejects a non-address string with a reason", () => {
    const res = adapter.validateAddress("notanaddress");
    expect(res.valid).toBe(false);
    expect(res.reason).toBeTruthy();
  });

  it("rejects an address with the wrong length", () => {
    expect(adapter.validateAddress("0x1234").valid).toBe(false);
  });
});

describe("EVMAdapter constructor", () => {
  it("exposes the chainId it was constructed with", () => {
    expect(new EVMAdapter(ChainId.BASE_SEPOLIA).chainId).toBe(ChainId.BASE_SEPOLIA);
  });

  it("throws a ChainError for an unknown chain id", () => {
    expect(() => new EVMAdapter("eip155:99999" as ChainId)).toThrow(ChainError);
  });
});
