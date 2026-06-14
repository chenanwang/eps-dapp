import Link from "next/link";
import { UserButton } from "@clerk/nextjs";
import DemoBanner from "@/components/DemoBanner";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <DemoBanner />
      <header className="border-b border-gray-800 bg-black">
        <nav className="mx-auto flex w-full max-w-6xl items-center gap-2 px-8 py-3">
          {/* Logo */}
          <Link href="/dashboard" className="mr-4 flex items-center gap-2 text-lg font-bold tracking-tight text-white">
            <span className="rounded bg-blue-600 px-2 py-0.5 text-sm font-black">EPS</span>
            <span className="hidden text-gray-400 text-xs font-normal sm:block">E-Process Server</span>
          </Link>

          {/* Nav links */}
          <div className="flex items-center gap-1 text-sm">
            <Link href="/dashboard" className="rounded px-3 py-1.5 text-gray-400 hover:bg-white/10 hover:text-white transition-colors">
              Dashboard
            </Link>
            <Link href="/dashboard/agent" className="rounded px-3 py-1.5 text-gray-400 hover:bg-white/10 hover:text-white transition-colors flex items-center gap-1.5">
              <span className="text-blue-400">◆</span> Agent Identity
            </Link>
            <Link href="/dashboard/standard" className="rounded px-3 py-1.5 text-gray-400 hover:bg-white/10 hover:text-white transition-colors">
              EPS-1.0 Standard
            </Link>
          </div>

          {/* Right side */}
          <div className="ml-auto flex items-center gap-3">
            <Link href="/dashboard/new" className="rounded-md bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-500 transition-colors">
              + New request
            </Link>
            <UserButton />
          </div>
        </nav>
      </header>
      <div className="mx-auto w-full max-w-6xl">
        {children}
      </div>
    </div>
  );
}
