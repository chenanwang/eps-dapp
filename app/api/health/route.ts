import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

/**
 * GET /api/health — unauthenticated liveness/readiness probe (T-504).
 *
 * Used by the staging deploy guide (docs/STAGING.md) and uptime checks to
 * confirm the app is serving and can reach Postgres. No auth: it exposes only
 * a status flag and timestamp, never any document or tenant data.
 *
 * Always returns 200 with `{ status: 'ok', timestamp }`; the `db` field is
 * `'ok'` when `SELECT 1` succeeds or `'error'` (with the error message) when
 * the DB is unreachable, so a probe can distinguish "app up, DB down".
 */
export async function GET() {
  let db: { db: "ok" } | { db: "error"; message: string };
  try {
    await prisma.$queryRaw`SELECT 1`;
    db = { db: "ok" };
  } catch (err) {
    db = { db: "error", message: err instanceof Error ? err.message : String(err) };
  }

  return NextResponse.json(
    { status: "ok", timestamp: new Date().toISOString(), ...db },
    { status: 200 },
  );
}
