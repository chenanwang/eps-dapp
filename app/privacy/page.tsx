import type { Metadata } from "next";
import Link from "next/link";
import DemoBanner from "@/components/DemoBanner";

export const metadata: Metadata = {
  title: "Privacy Policy — E-Process Server",
};

/**
 * Public Privacy Policy stub. The footer links here from every page, so this
 * must never 404. Minimal demo copy for ETHGlobal NYC 2026.
 */
export default function PrivacyPage() {
  return (
    <div className="min-h-screen">
      <DemoBanner />
      <header className="border-b border-gray-200">
        <nav className="mx-auto flex w-full max-w-3xl items-center justify-between px-6 py-4">
          <Link href="/" className="text-lg font-bold tracking-tight">
            EPS
          </Link>
          <Link href="/sign-in" className="text-sm font-medium text-blue-600 hover:underline">
            Sign In
          </Link>
        </nav>
      </header>
      <main className="mx-auto max-w-3xl px-6 py-12">
        <h1 className="mb-4 text-2xl font-bold">Privacy Policy</h1>
        <p className="text-gray-700">
          EPS collects minimal data for demo purposes. No personal data is
          shared with third parties.
        </p>
      </main>
    </div>
  );
}
