import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, UnauthorizedError } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  assertValidRecipient,
  InvalidRecipientError,
} from "@/lib/solana/validate-address";
import {
  checkAndDecrementQuota,
  QuotaExceededError,
  NoActiveSubscriptionError,
} from "@/lib/quota";
import { resolveENS, getAgentENSName } from "@/lib/ens/ENSResolver";
import { recordOnHedera } from "@/lib/hedera/HederaService";
import { rateLimit, clientKey, rateLimitHeaders } from "@/lib/rate-limit";

// Intake is quota-metered downstream, but rate-limit the endpoint itself
// (10/min/IP, T107) so a runaway client can't hammer auth + quota checks.
const INTAKE_LIMIT = { limit: 10, windowMs: 60_000 };

/**
 * Server-side validation schema for a service-request intake. Mirrors the
 * required fields of the dashboard form. The recipient wallet is checked for
 * shape here and then asserted on-curve below (a PDA / off-curve key is a valid
 * base58 string but not a serviceable recipient). `attested` must be literally
 * `true` — the filer cannot submit without attesting to the caption's accuracy.
 */
const ServiceRequestInput = z.object({
  caseCaption: z.string().trim().min(1, "Case caption is required.").max(500),
  plaintiffName: z.string().trim().min(1, "Plaintiff name is required.").max(300),
  defendantName: z.string().trim().min(1, "Defendant name is required.").max(300),
  recipientWallet: z.string().trim().min(1, "Recipient wallet is required."),
  // Optional client-side ENS resolution, sent as a fallback. The server always
  // re-resolves authoritatively (never trusting the client), but when server-side
  // resolution has a transient miss these let us proceed instead of hard-blocking
  // the filer (Section 1 — soft warning, not hard error).
  recipientEnsName: z.string().trim().nullish(),
  recipientResolvedAddress: z.string().trim().nullish(),
  courtOrderFlag: z.boolean().optional().default(false),
  attested: z.literal(true, {
    message: "You must attest to the accuracy of the case caption.",
  }),
});

/**
 * POST /api/service-requests — stage a new service-of-process request.
 *
 * Auth is required; the user (and org, if any) come from the verified Clerk
 * session token, never the request body. The request is owned by the filer's
 * `userId`, so a user with NO active organization can still file (issue #112).
 * The flow, in order:
 *   1. validate the body server-side (zod) — bad input is rejected BEFORE any
 *      quota is consumed (P2 gate: "bad input rejected pre-quota");
 *   2. validate the recipient wallet is an on-curve Solana address;
 *   3. if the filer has an active org, decrement that org's quota
 *      (`checkAndDecrementQuota`); a user with no org has no subscription to
 *      meter, so this step is skipped for them;
 *   4. create the {@link ServiceRequest} in the STAGED state, stamped with the
 *      filer's `userId` and connected to their org when they have one.
 *
 * Caption fields are confidential legal-filing metadata and are never logged
 * (CLAUDE.md hard rule #3).
 *
 * Body: `{ caseCaption, plaintiffName, defendantName, recipientWallet,
 *          courtOrderFlag?, attested: true }`
 * Returns: `{ id, status }` for the staged request.
 */
export async function POST(req: Request): Promise<Response> {
  const rl = rateLimit(`service-requests:${clientKey(req)}`, INTAKE_LIMIT);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Rate limit exceeded. Try again shortly." },
      { status: 429, headers: rateLimitHeaders(rl) },
    );
  }

  let authContext;
  try {
    authContext = await requireUser();
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    throw err;
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // (1) Field validation — pre-quota, so malformed submissions never burn quota.
  const parsed = ServiceRequestInput.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: z.flattenError(parsed.error).fieldErrors },
      { status: 400 },
    );
  }
  const input = parsed.data;

  // (2a) ENS resolution — handle ENS names and EVM addresses before Solana validation.
  const recipientInput = input.recipientWallet;
  let resolvedWallet = recipientInput;
  let ensDisplayName: string | null = null;
  let agentENSName: string | null = null;

  // If it looks like an ENS name (contains a dot, not a plain IP), resolve it.
  // ENS resolution is treated as a SOFT step (Section 1): a transient resolver
  // miss must not hard-block intake. Resolution precedence is:
  //   1. authoritative server-side resolution (never trusts the client), else
  //   2. the client-supplied resolved address, when it is a valid EVM address.
  // Only when BOTH are absent do we reject — there is genuinely no address to serve.
  const clientResolved =
    typeof input.recipientResolvedAddress === "string" &&
    /^0x[0-9a-fA-F]{40}$/.test(input.recipientResolvedAddress.trim())
      ? input.recipientResolvedAddress.trim()
      : null;

  if (recipientInput.includes('.') && !recipientInput.match(/^[0-9.]+$/)) {
    const ensResult = await resolveENS(recipientInput);
    if (ensResult.address) {
      resolvedWallet = ensResult.address;
      ensDisplayName = ensResult.displayName !== ensResult.address ? ensResult.displayName : null;
    } else if (clientResolved) {
      // Server-side resolution missed but the client already resolved this name
      // (e.g. RPC blip): proceed with the client's address rather than blocking.
      resolvedWallet = clientResolved;
      ensDisplayName = recipientInput;
    } else if (ensResult.wasENSName) {
      return NextResponse.json(
        { error: `ENS name "${recipientInput}" does not resolve to a wallet address.` },
        { status: 400 },
      );
    }
  }
  agentENSName = await getAgentENSName();

  // (2b) Recipient wallet must be a real, on-curve Solana account (not a PDA),
  //      OR a valid EVM address (0x...). EVM/ENS addresses skip Solana validation.
  const isEvmAddress = /^0x[0-9a-fA-F]{40}$/.test(resolvedWallet);
  if (!isEvmAddress) {
    try {
      assertValidRecipient(resolvedWallet);
    } catch (err) {
      if (err instanceof InvalidRecipientError) {
        return NextResponse.json(
          { error: err.message, reason: err.reason }, { status: 400 },
        );
      }
      throw err;
    }
  }

  // (3) Consume quota BEFORE creating the record — but only when the filer has
  // an active org to meter against. A user with no org has no subscription, so
  // there is nothing to decrement (issue #112). A missing/exhausted plan for an
  // org filer is a client-correctable condition (402/403), not a server error.
  if (authContext.orgId) {
    try {
      await checkAndDecrementQuota(authContext.orgId);
    } catch (err) {
      if (err instanceof QuotaExceededError) {
        return NextResponse.json({ error: err.message }, { status: 403 });
      }
      if (err instanceof NoActiveSubscriptionError) {
        return NextResponse.json({ error: err.message }, { status: 402 });
      }
      throw err;
    }
  }

  // (4) Stage the request. `attestedAt` is stamped server-side at the moment of
  // attestation; the owner (`userId`) and org both come from the verified token,
  // not the body. The org is connected only when the filer has an active one.
  const created = await prisma.serviceRequest.create({
    data: {
      userId: authContext.userId,
      ...(authContext.orgId
        ? { organization: { connect: { clerkOrgId: authContext.orgId } } }
        : {}),
      caseCaption: input.caseCaption,
      plaintiffName: input.plaintiffName,
      defendantName: input.defendantName,
      recipientWallet: resolvedWallet,
      courtOrderFlag: input.courtOrderFlag,
      attestedAt: new Date(),
      status: "STAGED",
      ensDisplayName,
      agentENSName,
    },
    select: { id: true, status: true, caseCaption: true, recipientWallet: true },
  });

  // (5) Anchor a Hedera Consensus Service proof (and HTS NFT receipt) at intake
  // time so the service detail page can show a "Blockchain Proof" immediately
  // (Sections 4 & 5). Per CLAUDE.md hard rules, Hedera failures must NEVER fail
  // the request: the whole block is wrapped in try/catch and any persistence of
  // proof fields is best-effort. The worker re-records authoritatively on final
  // delivery (worker/process.ts) — this is the demo-facing early stamp.
  try {
    const hedera = await recordOnHedera({
      deliveryId: created.id,
      documentHash: "", // document is uploaded after staging; hash anchored on delivery
      caseRef: created.caseCaption,
      servedTo: created.recipientWallet,
      servedBy: agentENSName ?? process.env.EVM_APP_WALLET_ADDRESS ?? "eps-agent",
    });
    const updates: Record<string, unknown> = {};
    if (hedera.hcs) {
      updates.hcsTopicId = hedera.hcs.topicId;
      updates.hcsSequenceNumber = hedera.hcs.sequenceNumber;
      updates.hcsConsensusTime = hedera.hcs.consensusTimestamp;
      updates.hcsTxId = hedera.hcs.transactionId;
      updates.hcsMirrorUrl = hedera.hcs.mirrorNodeUrl;
    }
    if (hedera.hts) {
      updates.htsTokenId = hedera.hts.tokenId;
      updates.htsSerialNumber = hedera.hts.serialNumber;
      updates.htsTxId = hedera.hts.transactionId;
      updates.htsMirrorUrl = hedera.hts.mirrorNodeUrl;
    }
    if (Object.keys(updates).length > 0) {
      await prisma.serviceRequest.update({ where: { id: created.id }, data: updates });
    }
  } catch (err) {
    // Never block intake on a Hedera hiccup — log (no document bytes) and move on.
    console.error("[service-requests] Hedera anchoring non-fatal error:", err);
  }

  return NextResponse.json({ id: created.id, status: created.status }, { status: 201 });
}
