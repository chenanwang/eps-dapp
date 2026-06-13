import { requireAuth, UnauthorizedError } from "@/lib/auth";
import { getOrCreateCertificatePdf } from "@/lib/certificate-store";
import { rateLimit, clientIpFromHeaders } from "@/lib/rateLimit";

// Abuse-throttle this endpoint per client IP before any auth or generation work
// happens (T-503). Reuses the process-local fixed-window limiter from T-401 so
// no external service is required (CLAUDE.md: no Redis). 10 req / IP / minute.
const RATE_LIMIT = { limit: 10, windowMs: 60_000 };

/**
 * GET /api/certificate/:noticeId — stream the notice's certificate PDF (T-403).
 *
 * Rate-limited per client IP (T-503): over-limit requests get 429 + Retry-After
 * before auth runs. Otherwise Clerk-authenticated — the caller's session is
 * verified server-side via `requireAuth()`; an unauthenticated request gets 401
 * and never reaches the generator. The certificate is generated + stored on
 * first request and reused thereafter (see {@link getOrCreateCertificatePdf}).
 * Unknown notice → 404.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ noticeId: string }> },
): Promise<Response> {
  const ip = clientIpFromHeaders(req.headers);
  const limit = rateLimit(ip, RATE_LIMIT);
  if (!limit.ok) {
    const retryAfter = Math.max(0, Math.ceil((limit.resetAt - Date.now()) / 1000));
    return Response.json(
      { error: "Too many requests" },
      { status: 429, headers: { "Retry-After": String(retryAfter) } },
    );
  }

  try {
    await requireAuth();
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return Response.json({ error: err.message }, { status: 401 });
    }
    throw err;
  }

  const { noticeId } = await params;

  let bytes: Uint8Array;
  try {
    bytes = await getOrCreateCertificatePdf(noticeId);
  } catch {
    return Response.json({ error: "Notice not found" }, { status: 404 });
  }

  return new Response(bytes as unknown as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="certificate-${noticeId}.pdf"`,
      "Content-Length": String(bytes.byteLength),
    },
  });
}
