"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface ServiceActionsProps {
  /** `ServiceRequest.id` the actions operate on (used by the demo skip). */
  serviceId: string;
  /** Whether `NEXT_PUBLIC_DEMO_MODE` is enabled — gates the demo skip button. */
  demoMode: boolean;
}

/**
 * Interactive actions for a STAGED service request (issue #113).
 *
 *  - Document upload: posts the selected file to POST /api/upload, which
 *    validates type/size + magic bytes and stores the encrypted object. Document
 *    bytes never leave the browser except over this request and are never logged.
 *  - Checkout: payment in this repo is org-subscription-level, so the
 *    "Proceed to checkout" action links to /pricing where a tier is selected and
 *    POSTed to /api/checkout (the issue's per-request checkout doesn't fit the
 *    subscription model — see the page-level note). It's shown for orgs that may
 *    still need an active plan.
 *  - Skip payment (demo): rendered only when `demoMode` is true (issue #125).
 *    For live ETHGlobal demos it POSTs to /api/demo/skip-payment to advance the
 *    request past the payment gate (STAGED → IN_PROGRESS) without Stripe, then
 *    refreshes so the new "Processing" state renders. The server re-checks demo
 *    mode + ownership, so the button can never bypass payment outside a demo.
 */
export function ServiceActions({ serviceId, demoMode }: ServiceActionsProps) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [skipping, setSkipping] = useState(false);

  async function onSkipPayment() {
    setError(null);
    setSkipping(true);
    try {
      const res = await fetch("/api/demo/skip-payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ serviceId }),
      });
      const data: { error?: string } = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Could not skip payment.");
      }
      // Status is now IN_PROGRESS — re-render the server component to show it.
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not skip payment.");
    } finally {
      setSkipping(false);
    }
  }

  async function onUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!file) {
      setError("Choose a document to upload.");
      return;
    }
    setError(null);
    setUploading(true);
    setDone(false);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: form });
      const data: { error?: string } = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Upload failed.");
      }
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={onUpload} className="flex flex-col gap-3">
        <input
          type="file"
          accept=".pdf,.doc,.docx"
          onChange={(e) => {
            setFile(e.target.files?.[0] ?? null);
            setDone(false);
            setError(null);
          }}
          className="text-sm"
        />
        <button
          type="submit"
          disabled={uploading || !file}
          className="inline-flex w-fit items-center rounded-lg bg-foreground px-4 py-2 text-sm font-semibold text-background hover:opacity-90 disabled:opacity-50"
        >
          {uploading ? "Uploading…" : "Upload document"}
        </button>
      </form>

      {error ? (
        <p role="alert" className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      ) : null}
      {done ? (
        <p className="rounded-md bg-green-50 px-4 py-3 text-sm text-green-700">
          Document uploaded and encrypted.
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <p className="text-foreground/60 text-sm">
          Need an active plan?{" "}
          <Link href="/pricing" className="text-blue-600 hover:underline">
            Proceed to checkout →
          </Link>
        </p>

        {demoMode ? (
          <button
            type="button"
            onClick={onSkipPayment}
            disabled={skipping}
            className="inline-flex w-fit items-center rounded-lg border border-dashed border-amber-500 px-4 py-2 text-sm font-semibold text-amber-700 hover:bg-amber-50 disabled:opacity-50"
          >
            {skipping ? "Skipping…" : "Skip payment (demo)"}
          </button>
        ) : null}
      </div>
    </div>
  );
}
