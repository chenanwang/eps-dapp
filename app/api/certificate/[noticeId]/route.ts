import { requireAuth, UnauthorizedError } from "@/lib/auth";
import { getOrCreateCertificatePdf } from "@/lib/certificate-store";

/**
 * GET /api/certificate/:noticeId — stream the notice's certificate PDF (T-403).
 *
 * Clerk-authenticated: the caller's session is verified server-side via
 * `requireAuth()`; an unauthenticated request gets 401 and never reaches the
 * generator. The certificate is generated + stored on first request and reused
 * thereafter (see {@link getOrCreateCertificatePdf}). Unknown notice → 404.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ noticeId: string }> },
): Promise<Response> {
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
