import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

/**
 * GET /api/health — unauthenticated liveness/readiness probe (T-504).
 *
 * Used by the staging deploy guide (docs/STAGING.md) and uptime checks to
 * confirm the app is serving and can reach Postgres. No auth: it exposes only
 * a status flag and timestamp, never any document or tenant data.
 *
 * Always returns 200 with `{ status: 'ok', db, timestamp, version }`; the `db`
 * field is `'connected'` when `SELECT 1` succeeds or `'error'` (with the error
 * message) when the DB is unreachable, so a probe can distinguish
 * "app up, DB down".
 */

/** App version surfaced to uptime checks and the deployment checklist. */
const VERSION = "1.0.0";

export async function GET() {
  let db: "connected" | "error" = "connected";
  let message: string | undefined;
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (err) {
    db = "error";
    message = err instanceof Error ? err.message : String(err);
  }

  return NextResponse.json(
    {
      status: "ok",
      db,
      timestamp: new Date().toISOString(),
      version: VERSION,
      ...(message ? { message } : {}),
    },
    { status: 200 },
  );
}
