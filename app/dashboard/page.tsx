import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";

/**
 * Visual treatment per service status. FAILED is called out in red with its
 * failure reason surfaced inline (T-306); the full services dashboard (cert /
 * notice downloads, filters) lands in T-405.
 */
const STATUS_BADGE: Record<string, string> = {
  STAGED: "bg-gray-100 text-gray-700 ring-gray-300",
  IN_PROGRESS: "bg-blue-100 text-blue-700 ring-blue-300",
  CONFIRMED: "bg-green-100 text-green-700 ring-green-300",
  FAILED: "bg-red-100 text-red-700 ring-red-300",
};

const STATUS_LABEL: Record<string, string> = {
  STAGED: "Staged",
  IN_PROGRESS: "In progress",
  CONFIRMED: "Confirmed",
  FAILED: "Failed",
};

function StatusBadge({ status }: { status: string }) {
  const tone = STATUS_BADGE[status] ?? STATUS_BADGE.STAGED;
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${tone}`}
    >
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}

export default async function DashboardPage() {
  // Rejects unauthenticated requests; userId/orgId are derived server-side only.
  const { userId, orgId } = await requireAuth();

  // The org's own service requests, newest first. Scoped to the verified org via
  // the Clerk-id relation — never a client-supplied filter. We select only the
  // fields the list needs; document/caption bytes are never logged (hard rule #3),
  // and the caption shown here is the org's own data in its authenticated view.
  const requests = await prisma.serviceRequest.findMany({
    where: { organization: { clerkOrgId: orgId } },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      caseCaption: true,
      defendantName: true,
      status: true,
      failureReason: true,
      txSignature: true,
      createdAt: true,
    },
  });

  const failedCount = requests.filter((r) => r.status === "FAILED").length;

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-4xl flex-col gap-6 p-8">
      <header className="flex flex-col gap-1">
        <h1 className="text-3xl font-bold">Service requests</h1>
        <p className="text-sm text-foreground/60">
          Signed in as {userId} · Organization {orgId}
        </p>
      </header>

      {failedCount > 0 && (
        <div
          role="alert"
          className="rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800"
        >
          {failedCount} service {failedCount === 1 ? "request" : "requests"}{" "}
          failed delivery. The quota for each failed request has been restored —
          review the details below and resubmit.
        </div>
      )}

      {requests.length === 0 ? (
        <p className="text-foreground/60">
          No service requests yet. Stage one to facilitate service and generate
          court-ready proof.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {requests.map((r) => (
            <li
              key={r.id}
              className={`rounded-lg border p-4 ${
                r.status === "FAILED"
                  ? "border-red-300 bg-red-50/40"
                  : "border-foreground/10"
              }`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex flex-col gap-1">
                  <span className="font-medium">{r.caseCaption}</span>
                  <span className="text-sm text-foreground/60">
                    Recipient: {r.defendantName}
                  </span>
                </div>
                <StatusBadge status={r.status} />
              </div>

              {r.status === "FAILED" && (
                <p className="mt-3 text-sm text-red-700">
                  <span className="font-semibold">Delivery failed:</span>{" "}
                  {r.failureReason ?? "Unknown error."} Quota for this request
                  was restored.
                </p>
              )}

              {r.status === "CONFIRMED" && r.txSignature && (
                <p className="mt-3 break-all text-xs text-foreground/50">
                  Tx: {r.txSignature}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
