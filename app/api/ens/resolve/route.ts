import { NextRequest, NextResponse } from 'next/server';
import { resolveENS } from '@/lib/ens/ENSResolver';
import { rateLimit, clientKey, rateLimitHeaders } from '@/lib/rate-limit';

// Resolution fans out to an external RPC; cap callers at 60/min/IP (T107) to
// protect that upstream quota from a hot loop or scraper.
const RESOLVE_LIMIT = { limit: 60, windowMs: 60_000 };

export async function GET(req: NextRequest) {
  const rl = rateLimit(`ens-resolve:${clientKey(req)}`, RESOLVE_LIMIT);
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'Rate limit exceeded. Try again shortly.' },
      { status: 429, headers: rateLimitHeaders(rl) },
    );
  }

  // Accept either `input` (in-app form) or `name` (judges/curl hit this directly).
  const input =
    req.nextUrl.searchParams.get('input')?.trim() ||
    req.nextUrl.searchParams.get('name')?.trim();
  if (!input || input.length < 3) {
    return NextResponse.json({ error: 'input required, min 3 chars' }, { status: 400 });
  }
  try {
    const result = await resolveENS(input);
    // A name that doesn't resolve must be an explicit JSON 404 — never an empty body.
    if (result.address === null) {
      return NextResponse.json(
        { ...result, error: 'Name not found' },
        { status: 404 },
      );
    }
    return NextResponse.json(result);
  } catch (err) {
    console.error('[ENS resolve]', err);
    return NextResponse.json({ error: 'Resolution failed' }, { status: 500 });
  }
}
