import { describe, it, expect, vi, beforeEach } from "vitest";
import zlib from "node:zlib";
import { renderCertificatePdf } from "@/lib/certificate-pdf";
import { UnauthorizedError } from "@/lib/auth";

/**
 * Extract the human-readable text from a pdf-lib document. Content streams are
 * Flate-compressed and the show-text operands are hex-encoded (`<48656C...>`),
 * so we inflate every stream then decode the hex string tokens back to text.
 */
function pdfText(bytes: Uint8Array): string {
  const buf = Buffer.from(bytes);
  let inflated = "";
  let idx = 0;
  while (true) {
    const s = buf.indexOf("stream", idx);
    if (s === -1) break;
    let start = s + "stream".length;
    if (buf[start] === 0x0d) start++; // optional CR
    if (buf[start] === 0x0a) start++; // LF
    const end = buf.indexOf("endstream", start);
    if (end === -1) break;
    const chunk = buf.subarray(start, end);
    try {
      inflated += zlib.inflateSync(chunk).toString("latin1");
    } catch {
      inflated += chunk.toString("latin1");
    }
    idx = end + "endstream".length;
  }
  return inflated.replace(/<([0-9A-Fa-f\s]+)>/g, (whole, hex: string) => {
    const compact = hex.replace(/\s/g, "");
    if (compact.length % 2 !== 0) return whole;
    return Buffer.from(compact, "hex").toString("latin1");
  });
}

// --- Mocks for the API route -------------------------------------------------
// The route calls requireAuth() then getOrCreateCertificatePdf(); mock both so
// the handler can be exercised without a live Clerk session or a database.
const requireAuthMock = vi.fn();
vi.mock("@/lib/auth", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth")>("@/lib/auth");
  return { ...actual, requireAuth: () => requireAuthMock() };
});

const getOrCreateMock = vi.fn();
vi.mock("@/lib/certificate-store", () => ({
  getOrCreateCertificatePdf: (id: string) => getOrCreateMock(id),
}));

import { GET } from "@/app/api/certificate/[noticeId]/route";

const SAMPLE = {
  caseCaption: "Acme Corp v. Doe, No. 24-CV-001",
  plaintiffName: "Acme Corp",
  defendantName: "Jane Doe",
  recipientWallet: "9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin",
  documentSha256: "a".repeat(64),
  txSignature: "5".repeat(88),
  slot: 469033708n,
  blockTime: new Date("2026-06-13T01:00:00.000Z"),
  noticeToken: "0123456789abcdef0123456789abcdef",
  firstViewedAt: new Date("2026-06-13T02:30:00.000Z"),
  firstViewerIp: "203.0.113.x",
};

describe("renderCertificatePdf", () => {
  it("produces non-empty PDF bytes (a valid %PDF header)", async () => {
    const bytes = await renderCertificatePdf(SAMPLE);
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.byteLength).toBeGreaterThan(0);
    // Every PDF starts with the "%PDF-" magic.
    expect(Buffer.from(bytes.slice(0, 5)).toString("latin1")).toBe("%PDF-");
  });

  it("embeds the certificate header text", async () => {
    const bytes = await renderCertificatePdf(SAMPLE);
    expect(pdfText(bytes)).toContain("EPS NOTICE CERTIFICATE");
  });

  it("includes the document hash and tx signature", async () => {
    const text = pdfText(await renderCertificatePdf(SAMPLE));
    expect(text).toContain(SAMPLE.documentSha256);
    expect(text).toContain(SAMPLE.txSignature);
  });

  it("renders 'Not yet viewed' when there is no first-access record", async () => {
    const bytes = await renderCertificatePdf({
      ...SAMPLE,
      firstViewedAt: null,
      firstViewerIp: null,
    });
    expect(pdfText(bytes)).toContain("Not yet viewed");
  });
});

describe("GET /api/certificate/:noticeId", () => {
  beforeEach(() => {
    requireAuthMock.mockReset();
    getOrCreateMock.mockReset();
    requireAuthMock.mockResolvedValue({ userId: "user_1", orgId: "org_1" });
    getOrCreateMock.mockResolvedValue(new Uint8Array([0x25, 0x50, 0x44, 0x46]));
  });

  it("returns 401 when the request is unauthenticated", async () => {
    requireAuthMock.mockRejectedValue(new UnauthorizedError());
    const res = await GET(new Request("http://localhost/api/certificate/n1"), {
      params: Promise.resolve({ noticeId: "n1" }),
    });
    expect(res.status).toBe(401);
    expect(getOrCreateMock).not.toHaveBeenCalled();
  });

  it("streams the PDF with application/pdf when authenticated", async () => {
    const res = await GET(new Request("http://localhost/api/certificate/n1"), {
      params: Promise.resolve({ noticeId: "n1" }),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/pdf");
    expect(getOrCreateMock).toHaveBeenCalledWith("n1");
    const body = new Uint8Array(await res.arrayBuffer());
    expect(body.byteLength).toBe(4);
  });

  it("returns 404 when the notice does not exist", async () => {
    getOrCreateMock.mockRejectedValue(new Error("No notice found for id n9"));
    const res = await GET(new Request("http://localhost/api/certificate/n9"), {
      params: Promise.resolve({ noticeId: "n9" }),
    });
    expect(res.status).toBe(404);
  });
});
