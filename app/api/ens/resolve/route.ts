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

  const input = req.nextUrl.searchParams.get('input')?.trim();
  if (!input || input.length < 3) {
    return NextResponse.json({ error: 'input required, min 3 chars' }, { status: 400 });
  }
  try {
    const result = await resolveENS(input);
    return NextResponse.json(result);
  } catch (err) {
    console.error('[ENS resolve]', err);
    return NextResponse.json({ error: 'Resolution failed' }, { status: 500 });
  }
}
