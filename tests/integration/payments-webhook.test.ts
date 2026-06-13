/**
 * Integration tests for POST /api/payments/dynamic-webhook (T103).
 */
import { describe, it, expect } from "vitest";
import { POST } from "@/app/api/payments/dynamic-webhook/route";
import { NextRequest } from "next/server";

function post(raw: string) {
  return new NextRequest("http://localhost/api/payments/dynamic-webhook", {
    method: "POST",
    body: raw,
  });
}

describe("POST /api/payments/dynamic-webhook", () => {
  it("returns 400 for a malformed (non-JSON) payload", async () => {
    const res = await POST(post("{not json"));
    expect(res.status).toBe(400);
  });

  it("returns 200 and acknowledges a valid completed payload", async () => {
    const res = await POST(
      post(JSON.stringify({ sessionId: "sess_1", status: "completed" })),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.received).toBe(true);
  });

  it("returns 200 for a valid pending payload", async () => {
    const res = await POST(
      post(JSON.stringify({ sessionId: "sess_2", status: "pending" })),
    );
    expect(res.status).toBe(200);
  });
});
