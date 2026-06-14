"use client";

import { useState } from "react";
import Link from "next/link";

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
 */
export function ServiceActions() {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

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

      <p className="text-foreground/60 text-sm">
        Need an active plan?{" "}
        <Link href="/pricing" className="text-blue-600 hover:underline">
          Proceed to checkout →
        </Link>
      </p>
    </div>
  );
}
