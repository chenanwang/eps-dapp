import { NextResponse } from "next/server";
import { requireAuth, UnauthorizedError } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { rateLimit, clientKey, rateLimitHeaders } from "@/lib/rate-limit";

// Match the collection endpoint's throttle (10/min/IP, T107) so a client can't
// hammer auth + DB lookups by polling a single request id.
const READ_LIMIT = { limit: 10, windowMs: 60_000 };

/**
 * GET /api/service-requests/:id — fetch a single service request.
 *
 * Auth is required; the org comes from the verified Clerk session token, never
 * the URL or body. The lookup is scoped to the caller's active organization, so
 * an id belonging to another org is indistinguishable from a non-existent one
 * (both return 404) — an org can never read another org's confidential filing.
 *
 * Caption/party fields are confidential legal-filing metadata; they are returned
 * to the owning org here but are never logged (CLAUDE.md hard rule #3).
 *
 * Returns: the {@link ServiceRequest} (with its `access` and `certificatePdf`
 * presence) as JSON, or 404 if the id is unknown / not owned by the caller.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const rl = rateLimit(`service-request:${clientKey(req)}`, READ_LIMIT);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Rate limit exceeded. Try again shortly." },
      { status: 429, headers: rateLimitHeaders(rl) },
    );
  }

  let authContext;
  try {
    authContext = await requireAuth();
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    throw err;
  }

  const { id } = await params;

  // Scope by the verified org id: a request owned by another org resolves to
  // null and is reported as 404, not 403 (don't leak existence across orgs).
  const service = await prisma.serviceRequest.findFirst({
    where: { id, organization: { clerkOrgId: authContext.orgId } },
    include: {
      access: true,
      certificatePdf: { select: { id: true } },
    },
  });

  if (!service) {
    return NextResponse.json({ error: "Service request not found" }, { status: 404 });
  }

  // BigInt (`slot`) is not JSON-serialisable; stringify it for the wire.
  return NextResponse.json({
    ...service,
    slot: service.slot?.toString() ?? null,
  });
}
