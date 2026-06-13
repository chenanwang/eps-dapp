import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// --- In-memory Prisma mock ------------------------------------------------
// `recordFirstAccess` runs everything inside `prisma.$transaction(fn)`. We pass
// `fn` a hand-rolled `tx` backed by a tiny store so we can assert idempotency:
// once a NoticeAccess row exists, `serviceRequest.findUnique` surfaces it via
// the `access` relation and the guard short-circuits.
const h = vi.hoisted(() => {
  const ACCESS_AT = "2026-06-13T12:34:56.000Z";
  const store = {
    access: null as { accessedAt: Date } | null,
    ownerEmail: "owner@test.eps" as string | null,
    caseCaption: "Acme Corp v. Doe, No. 24-CV-001",
    addenda: [] as unknown[],
    audits: [] as unknown[],
  };

  const findUnique = vi.fn(async () => ({
    caseCaption: store.caseCaption,
    organization: { ownerEmail: store.ownerEmail },
    access: store.access,
  }));
  const noticeAccessCreate = vi.fn(async () => {
    const accessedAt = new Date(ACCESS_AT);
    store.access = { accessedAt };
    return { accessedAt };
  });
  const certCreate = vi.fn(async (arg: { data: unknown }) => {
    store.addenda.push(arg.data);
    return arg.data;
  });
  const auditCreate = vi.fn(async (arg: { data: unknown }) => {
    store.audits.push(arg.data);
    return arg.data;
  });

  const tx = {
    serviceRequest: { findUnique },
    noticeAccess: { create: noticeAccessCreate },
    certificateAddendum: { create: certCreate },
    auditLog: { create: auditCreate },
  };
  const $transaction = vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx));

  return { store, findUnique, noticeAccessCreate, certCreate, auditCreate, $transaction };
});

vi.mock("@/lib/db", () => ({ prisma: { $transaction: h.$transaction } }));

import { recordFirstAccess, maskIp } from "@/lib/noticeAccess";
import { sendFirstAccessEmail } from "@/lib/email";

const NOTICE_ID = "svc_1";

describe("recordFirstAccess", () => {
  beforeEach(() => {
    h.store.access = null;
    h.store.ownerEmail = "owner@test.eps";
    h.store.addenda.length = 0;
    h.store.audits.length = 0;
    h.findUnique.mockClear();
    h.noticeAccessCreate.mockClear();
    h.certCreate.mockClear();
    h.auditCreate.mockClear();
  });

  it("inserts the access row, addendum and audit on the first call", async () => {
    const result = await recordFirstAccess(NOTICE_ID, "203.0.113.42", "Mozilla/5.0");

    expect(result.isFirstAccess).toBe(true);
    expect(result.ownerEmail).toBe("owner@test.eps");
    expect(result.caseRef).toBe("Acme Corp v. Doe, No. 24-CV-001");
    // IP masked for the downstream email / certificate.
    expect(result.maskedIp).toBe("203.0.113.x");

    expect(h.noticeAccessCreate).toHaveBeenCalledTimes(1);
    expect(h.noticeAccessCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { noticeId: NOTICE_ID, ip: "203.0.113.42", userAgent: "Mozilla/5.0" },
      }),
    );
    // Certificate "First Viewed" addendum written with the MASKED ip.
    expect(h.certCreate).toHaveBeenCalledTimes(1);
    expect(h.store.addenda[0]).toMatchObject({
      noticeId: NOTICE_ID,
      viewerIp: "203.0.113.x",
    });
    // Audit row written; carries only the masked ip (never the caption).
    expect(h.auditCreate).toHaveBeenCalledTimes(1);
    expect(h.store.audits[0]).toMatchObject({
      action: "NOTICE_FIRST_ACCESSED",
      targetId: NOTICE_ID,
      metadata: { viewerIp: "203.0.113.x" },
    });
  });

  it("is idempotent: a second call inserts no duplicate row", async () => {
    const first = await recordFirstAccess(NOTICE_ID, "203.0.113.42", "UA");
    const second = await recordFirstAccess(NOTICE_ID, "203.0.113.42", "UA");

    expect(first.isFirstAccess).toBe(true);
    expect(second.isFirstAccess).toBe(false);
    // No second insert / addendum / audit.
    expect(h.noticeAccessCreate).toHaveBeenCalledTimes(1);
    expect(h.certCreate).toHaveBeenCalledTimes(1);
    expect(h.auditCreate).toHaveBeenCalledTimes(1);
    // Repeat view reports the original timestamp.
    expect(second.viewedAt.toISOString()).toBe(first.viewedAt.toISOString());
  });

  it("fires the owner alert email on the first access only", async () => {
    const send = vi.fn();
    // Mirror the page's gate: send iff first access and an owner email exists.
    const visit = async () => {
      const r = await recordFirstAccess(NOTICE_ID, "203.0.113.42", "UA");
      if (r.isFirstAccess && r.ownerEmail) await send(r);
    };

    await visit();
    await visit();

    expect(send).toHaveBeenCalledTimes(1);
  });
});

describe("maskIp", () => {
  it("masks the last octet of an IPv4 address", () => {
    expect(maskIp("203.0.113.42")).toBe("203.0.113.x");
  });

  it("masks the final group of an IPv6 address", () => {
    expect(maskIp("2001:db8::1")).toBe("2001:db8::x");
  });

  it("leaves non-IP values unchanged", () => {
    expect(maskIp("unknown")).toBe("unknown");
  });
});

describe("sendFirstAccessEmail", () => {
  const email = {
    to: "owner@test.eps",
    caseRef: "Acme Corp v. Doe, No. 24-CV-001",
    maskedIp: "203.0.113.x",
    viewedAt: new Date("2026-06-13T12:34:56.000Z"),
    noticeUrl: "https://eps.example/n/a1b2c3d4e5f60718293a4b5c6d7e8f90",
  };
  const originalKey = process.env.RESEND_API_KEY;

  afterEach(() => {
    if (originalKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = originalKey;
    vi.unstubAllGlobals();
  });

  it("skips (no throw) when RESEND_API_KEY is absent", async () => {
    delete process.env.RESEND_API_KEY;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await sendFirstAccessEmail(email);

    expect(result.sent).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("POSTs to Resend with the subject and masked body when configured", async () => {
    process.env.RESEND_API_KEY = "re_test_key";
    const fetchMock = vi.fn(async () => ({ ok: true }) as Response);
    vi.stubGlobal("fetch", fetchMock);

    const result = await sendFirstAccessEmail(email);

    expect(result.sent).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe("https://api.resend.com/emails");
    expect((init.headers as Record<string, string>).Authorization).toBe(
      "Bearer re_test_key",
    );
    const body = JSON.parse(init.body as string);
    expect(body.to).toBe("owner@test.eps");
    expect(body.subject).toBe("Notice viewed: Acme Corp v. Doe, No. 24-CV-001");
    expect(body.text).toContain("203.0.113.x");
    expect(body.text).toContain("2026-06-13 12:34:56 UTC");
    expect(body.text).toContain(email.noticeUrl);
  });
});
