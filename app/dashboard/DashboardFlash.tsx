"use client";

import { useEffect, useState } from "react";

/**
 * Dismissible green flash banner for post-action redirects. Reads the reason
 * from the URL query (set by the pricing demo bypass and the new-request flow)
 * and clears it from the address bar so a refresh doesn't re-show the toast.
 */
const MESSAGES: Record<string, string> = {
  "subscribed=demo": "Subscribed! (Demo mode)",
  "paid=demo": "Payment received! (Demo mode)",
  "staged=1":
    "Service request staged — Hedera HCS proof will be anchored upon delivery.",
};

export default function DashboardFlash() {
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    let matched: string | null = null;
    for (const [key, text] of Object.entries(MESSAGES)) {
      const [k, v] = key.split("=");
      if (params.get(k) === v) {
        matched = text;
        params.delete(k);
        break;
      }
    }
    if (matched) {
      setMessage(matched);
      const qs = params.toString();
      window.history.replaceState(
        null,
        "",
        window.location.pathname + (qs ? `?${qs}` : ""),
      );
    }
  }, []);

  if (!message) return null;

  return (
    <div
      role="status"
      className="mx-auto mt-4 flex w-full max-w-5xl items-center justify-between gap-4 rounded-md bg-green-50 px-4 py-3 text-sm font-medium text-green-800"
    >
      <span>{message}</span>
      <button
        type="button"
        onClick={() => setMessage(null)}
        aria-label="Dismiss"
        className="text-green-700 hover:text-green-900"
      >
        ✕
      </button>
    </div>
  );
}
