import { auth } from "@clerk/nextjs/server";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db";
import type { ServiceStatus } from "@prisma/client";
import { ServiceActions } from "./ServiceActions";

/**
 * Service-request detail page (issue #113). Shows a single request's case
 * metadata, derived status, and the action available in its current lifecycle
 * state, then links back to the list.
 *
 * Data-model note: the issue was written against a hypothetical
 * `staged/paid/processing/delivered` status set. This repo's real
 * `ServiceStatus` enum is `STAGED → IN_PROGRESS → CONFIRMED → FAILED`, and
 * payment is handled at the org-subscription level (Stripe Checkout in
 * `subscription` mode → quota), not per request — a request only reaches
 * `STAGED` after quota is consumed. The mapping below preserves the issue's
 * intent against the real lifecycle:
 *   STAGED      → "Staged"      — queued for delivery; document-upload area.
 *   IN_PROGRESS → "Processing"  — the worker is delivering on-chain.
 *   CONFIRMED   → "Delivered"   — certificate + on-chain / Hedera proof.
 *   FAILED      → "Failed"      — surfaces the (non-confidential) failure reason.
 */

interface PageProps {
  // Next.js 15 dynamic route params are async.
  params: Promise<{ id: string }>;
}

const STATUS_LABEL: Record<ServiceStatus, string> = {
  STAGED: "Staged",
  IN_PROGRESS: "Processing",
  CONFIRMED: "Delivered",
  FAILED: "Failed",
};

const STATUS_BADGE: Record<ServiceStatus, string> = {
  STAGED: "bg-amber-100 text-amber-800",
  IN_PROGRESS: "bg-blue-100 text-blue-800",
  CONFIRMED: "bg-green-100 text-green-800",
  FAILED: "bg-red-100 text-red-800",
};

function StatusBadge({ status }: { status: ServiceStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${STATUS_BADGE[status]}`}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-foreground/60 text-xs font-medium uppercase tracking-wide">{label}</dt>
      <dd className="text-sm">{value}</dd>
    </div>
  );
}

export default async function ServiceDetailPage({ params }: PageProps) {
  const { id } = await params;

  // userId/orgId come from the verified Clerk session token, never the client.
  const { userId, orgId } = await auth();
  if (!userId) {
    redirect("/sign-in");
  }

  // Scope the lookup to the caller's active org: a request owned by another org
  // resolves to null and renders as 404 — never another org's confidential filing.
  const service = await prisma.serviceRequest.findFirst({
    where: { id, organization: { clerkOrgId: orgId ?? "" } },
    include: { certificatePdf: { select: { id: true } } },
  });

  if (!service) {
    notFound();
  }

  const created = service.createdAt.toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });

  // Prefer the stored Hedera mirror URL; otherwise build a HashScan link from
  // the topic id (+ sequence number, when the consensus message was recorded).
  const hederaLink =
    service.hcsMirrorUrl ??
    (service.hcsTopicId
      ? `https://hashscan.io/testnet/topic/${service.hcsTopicId}` +
        (service.hcsSequenceNumber != null ? `/message/${service.hcsSequenceNumber}` : "")
      : null);

  // Solana delivery proof: devnet explorer link for the persisted signature.
  const solanaLink = service.txSignature
    ? `https://explorer.solana.com/tx/${service.txSignature}?cluster=devnet`
    : null;

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-6 py-12">
      <div>
        <Link href="/dashboard" className="text-sm text-blue-600 hover:underline">
          ← Back to Dashboard
        </Link>
      </div>

      <header className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-4">
          <h1 className="text-2xl font-bold">{service.caseCaption}</h1>
          <StatusBadge status={service.status} />
        </div>
      </header>

      <section className="rounded-xl border border-foreground/10 p-6">
        <dl className="grid gap-6 sm:grid-cols-2">
          <Detail label="Plaintiff" value={service.plaintiffName} />
          <Detail label="Defendant" value={service.defendantName} />
          <Detail label="Recipient wallet" value={service.recipientWallet} />
          <Detail label="Created" value={created} />
        </dl>
      </section>

      {/* Status-conditional action area. */}
      {service.status === "STAGED" ? (
        <section className="flex flex-col gap-4 rounded-xl border border-foreground/10 p-6">
          <div>
            <h2 className="text-lg font-semibold">Documents</h2>
            <p className="text-foreground/70 text-sm">
              This request is staged and queued for delivery. Upload the document to be served below;
              EPS facilitates service and generates court-ready proof of delivery.
            </p>
          </div>
          {/* Interactive upload + subscription-checkout actions (client component). */}
          <ServiceActions
            serviceId={service.id}
            demoMode={process.env.NEXT_PUBLIC_DEMO_MODE === "true"}
          />
        </section>
      ) : null}

      {service.status === "IN_PROGRESS" ? (
        <section className="rounded-xl border border-foreground/10 p-6">
          <h2 className="text-lg font-semibold">Processing</h2>
          <p className="text-foreground/70 text-sm">
            Delivery is in progress. The on-chain proof and certificate will appear here once the
            delivery is confirmed.
          </p>
        </section>
      ) : null}

      {service.status === "CONFIRMED" ? (
        <section className="flex flex-col gap-4 rounded-xl border border-foreground/10 p-6">
          <h2 className="text-lg font-semibold">Delivered</h2>
          <div className="flex flex-col gap-3">
            <a
              href={`/api/certificate/${service.id}`}
              className="inline-flex w-fit items-center rounded-lg bg-foreground px-4 py-2 text-sm font-semibold text-background hover:opacity-90"
            >
              Download Certificate
            </a>
            {solanaLink ? (
              <p className="text-sm">
                On-chain proof:{" "}
                <a
                  href={solanaLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="break-all text-blue-600 hover:underline"
                >
                  {service.txSignature}
                </a>
              </p>
            ) : null}
            {hederaLink ? (
              <p className="text-sm">
                Hedera consensus proof:{" "}
                <a
                  href={hederaLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline"
                >
                  View on HashScan ↗
                </a>
              </p>
            ) : null}
          </div>
        </section>
      ) : null}

      {service.status === "FAILED" ? (
        <section className="rounded-xl border border-red-200 bg-red-50 p-6">
          <h2 className="text-lg font-semibold text-red-800">Delivery failed</h2>
          <p className="mt-1 text-sm text-red-700">
            {service.failureReason ?? "This delivery could not be completed."}
          </p>
        </section>
      ) : null}
    </main>
  );
}
