/**
 * Integration tests for GET /api/ens/resolve (T103).
 * ENSResolver is mocked so the route never hits Ethereum mainnet.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const { resolveENS } = vi.hoisted(() => ({ resolveENS: vi.fn() }));
vi.mock("@/lib/ens/ENSResolver", () => ({ resolveENS }));

import { GET } from "@/app/api/ens/resolve/route";
import { NextRequest } from "next/server";

function req(qs: string) {
  return new NextRequest(`http://localhost/api/ens/resolve${qs}`);
}

beforeEach(() => vi.clearAllMocks());

describe("GET /api/ens/resolve", () => {
  it("returns 200 for an ENS name", async () => {
    resolveENS.mockResolvedValue({
      address: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
      displayName: "vitalik.eth",
      wasENSName: true,
      primaryName: null,
    });
    const res = await GET(req("?input=vitalik.eth"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.address).toMatch(/^0x/);
  });

  it("returns 200 for a plain EVM address", async () => {
    resolveENS.mockResolvedValue({
      address: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
      displayName: "vitalik.eth",
      wasENSName: false,
      primaryName: "vitalik.eth",
    });
    const res = await GET(req("?input=0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045"));
    expect(res.status).toBe(200);
  });

  it("returns 400 when input is missing", async () => {
    const res = await GET(req(""));
    expect(res.status).toBe(400);
    expect(resolveENS).not.toHaveBeenCalled();
  });

  it("returns 400 when input is shorter than 3 chars", async () => {
    const res = await GET(req("?input=ab"));
    expect(res.status).toBe(400);
  });

  it("returns 500 when resolution throws", async () => {
    resolveENS.mockRejectedValue(new Error("rpc down"));
    const res = await GET(req("?input=vitalik.eth"));
    expect(res.status).toBe(500);
  });
});
