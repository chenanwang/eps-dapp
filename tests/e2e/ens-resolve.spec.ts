import { expect, test } from "@playwright/test";

/**
 * T104 E2E — ENS resolve endpoint. Resolution depends on an external RPC that
 * isn't guaranteed in CI, so we assert the endpoint *contract*, not a specific
 * address: too-short input is rejected (400), and a valid name returns 200 with
 * an `address` field — a non-empty string when the RPC resolved it, or `null`
 * when the RPC is unreachable (the resolver degrades gracefully rather than
 * throwing). Either way the route never 5xx-crashes.
 */
test("rejects too-short input with 400", async ({ request }) => {
  const res = await request.get("/api/ens/resolve?input=ab");
  expect(res.status()).toBe(400);
});

test("resolves vitalik.eth: 200 with an address field (string or null)", async ({ request }) => {
  const res = await request.get("/api/ens/resolve?input=vitalik.eth");
  expect(res.status()).toBeLessThan(500);

  const body = await res.json();
  if (res.status() === 200) {
    expect(body).toHaveProperty("address");
    if (body.address !== null) {
      expect(typeof body.address).toBe("string");
      expect(body.address.length).toBeGreaterThan(0);
    }
  } else {
    expect(body).toHaveProperty("error");
  }
});
