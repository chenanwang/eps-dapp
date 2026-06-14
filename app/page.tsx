import Link from "next/link";

const VALUE_PROPS = [
  {
    icon: "📬",
    title: "ENS Addressable",
    body:
      "Serve any ENS name or wallet address. Served by youhavebeenserved.eth — an ENSIP-25 compliant AI agent with on-chain identity.",
  },
  {
    icon: "⛓",
    title: "Hedera-Anchored",
    body: "Every delivery recorded on Hedera Consensus Service.",
  },
  {
    icon: "📄",
    title: "Court-Ready Certificate",
    body: "Download a signed proof of service instantly.",
  },
];

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col bg-[#0a0a0a] text-[#ededed]">
      <main className="flex flex-1 flex-col items-center justify-center px-6 py-24 text-center">
        <span className="mb-6 rounded-full border border-white/15 px-4 py-1 text-xs font-medium uppercase tracking-widest text-white/60">
          BLI E-Process Server
        </span>

        <h1 className="max-w-3xl text-balance text-4xl font-bold leading-tight sm:text-6xl">
          Court-ready service of process — on-chain.
        </h1>

        <p className="mt-6 max-w-xl text-balance text-lg text-white/60 sm:text-xl">
          Deliver legal documents to any ENS address. Hedera-anchored. Instantly
          verifiable.
        </p>

        <div className="mt-10 flex flex-col gap-4 sm:flex-row">
          <Link
            href="/dashboard"
            className="rounded-lg bg-white px-7 py-3 text-base font-semibold text-black transition hover:bg-white/90"
          >
            Get started →
          </Link>
          <Link
            href="/dashboard"
            className="rounded-lg border border-white/20 px-7 py-3 text-base font-semibold text-white transition hover:bg-white/10"
          >
            Sign in
          </Link>
        </div>

        <div className="mt-24 grid w-full max-w-4xl gap-6 sm:grid-cols-3">
          {VALUE_PROPS.map((prop) => (
            <div
              key={prop.title}
              className="rounded-xl border border-white/10 bg-white/[0.02] p-6 text-left"
            >
              <div className="text-3xl" aria-hidden>
                {prop.icon}
              </div>
              <h2 className="mt-4 text-lg font-semibold">{prop.title}</h2>
              <p className="mt-2 text-sm text-white/60">{prop.body}</p>
            </div>
          ))}
        </div>
      </main>

      <footer className="border-t border-white/10 px-6 py-8">
        <nav className="mx-auto flex max-w-4xl flex-wrap items-center justify-center gap-x-8 gap-y-2 text-sm text-white/50">
          <Link href="/pricing" className="transition hover:text-white">
            Pricing
          </Link>
          <Link href="/legal/terms" className="transition hover:text-white">
            Terms
          </Link>
          <Link href="/legal/privacy" className="transition hover:text-white">
            Privacy
          </Link>
        </nav>
      </footer>
    </div>
  );
}
