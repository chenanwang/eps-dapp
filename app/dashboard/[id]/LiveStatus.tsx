"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { ServiceStatus } from "@prisma/client";

/**
 * Live status badge + poller for the service-detail page (issue #122).
 *
 * The page itself stays a server component (secure org-scoped Prisma read,
 * SSR of the status-conditional sections). This thin client component is
 * rendered into the header with the server's initial status and then polls
 * GET /api/service-requests/:id every 5s. When the status changes it calls
 * `router.refresh()`, which re-runs the parent server component and swaps the
 * conditional sections (upload area → processing → certificate/proofs) with no
 * full page reload — so the page updates live during a demo.
 *
 * Status mapping note (carried over from issue #113): the issue text referred
 * to `COMPLETE`/`ANCHORED`, but this repo's real lifecycle is
 * `STAGED → IN_PROGRESS → CONFIRMED → FAILED`. The terminal states are
 * `CONFIRMED` and `FAILED`; polling stops once either is reached.
 *
 * The read endpoint is rate-limited to 10 req/min/IP, so a strict 5s cadence
 * (12/min) can occasionally hit a 429. Non-OK responses and network blips are
 * swallowed — we keep the last known status and retry on the next tick rather
 * than surfacing transient errors in the UI.
 */

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

// Once a request reaches one of these there is nothing left to deliver, so we
// stop polling.
const TERMINAL: ReadonlySet<ServiceStatus> = new Set<ServiceStatus>(["CONFIRMED", "FAILED"]);

const POLL_INTERVAL_MS = 5_000;

export function LiveStatus({
  id,
  initialStatus,
}: {
  id: string;
  initialStatus: ServiceStatus;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<ServiceStatus>(initialStatus);

  const isLive = !TERMINAL.has(status);

  useEffect(() => {
    // Terminal already — don't start an interval.
    if (TERMINAL.has(status)) {
      return;
    }

    let cancelled = false;

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/service-requests/${id}`, { cache: "no-store" });
        // Transient (429 rate-limit / 5xx) — keep the last known status and
        // try again on the next tick.
        if (!res.ok) {
          return;
        }
        const data: { status?: ServiceStatus } = await res.json();
        if (cancelled || !data.status || data.status === status) {
          return;
        }
        setStatus(data.status);
        // Re-render the server component so its status-conditional sections
        // reflect the new state, without a full page reload.
        router.refresh();
      } catch {
        // Network blip — ignore and retry on the next tick.
      }
    }, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [id, status, router]);

  return (
    <div className="flex items-center gap-3">
      {isLive ? (
        <span
          className="inline-flex items-center gap-1.5 text-xs font-medium text-green-700"
          title="Polling for live status updates"
        >
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-500 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
          </span>
          Live
        </span>
      ) : null}
      <span
        className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${STATUS_BADGE[status]}`}
      >
        {STATUS_LABEL[status]}
      </span>
    </div>
  );
}
