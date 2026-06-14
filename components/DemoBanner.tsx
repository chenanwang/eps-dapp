/**
 * Sticky demo disclaimer shown when NEXT_PUBLIC_DEMO_MODE=true so that judges
 * (and any other demo viewers) understand this environment is a testnet
 * demonstration and not a live legal-service platform.
 *
 * Server component: reads the env var at render time and renders nothing when
 * demo mode is off, so it is zero-cost in non-demo environments.
 */
export default function DemoBanner() {
  if (process.env.NEXT_PUBLIC_DEMO_MODE !== "true") {
    return null;
  }

  return (
    <div
      role="status"
      className="sticky top-0 z-50 bg-yellow-300 px-4 py-2 text-center text-sm font-medium text-yellow-950"
    >
      ⚠️ Testnet demo — no real legal proceedings. Hedera HCS testnet only.
    </div>
  );
}
