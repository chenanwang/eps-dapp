/**
 * Transactional email via Resend (T-402).
 *
 * Resend exposes a plain JSON REST API, so we call it with `fetch` rather than
 * pulling in the SDK (CLAUDE.md: no new dependencies without an ADR). The API
 * key comes from `RESEND_API_KEY`; when it is absent (e.g. local dev or tests)
 * the send is skipped and reported as not-sent rather than throwing — a missing
 * alert must never break the recipient's view of the public notice.
 *
 * Nothing confidential is emailed: the body carries the case reference, a
 * MASKED viewer IP, the view timestamp, and the public notice URL. No document
 * or caption bytes (hard rule #3).
 */

const RESEND_ENDPOINT = "https://api.resend.com/emails";

/** Default sender; override with `RESEND_FROM`. Resend requires a verified domain. */
const DEFAULT_FROM = "EPS Notices <notices@eps.local>";

export interface FirstAccessEmail {
  /** Service-owner address (the notice's org `ownerEmail`). */
  to: string;
  /** Case reference shown in the subject (the case caption). */
  caseRef: string;
  /** Recipient IP, last octet masked. */
  maskedIp: string;
  /** When the notice was first viewed (UTC). */
  viewedAt: Date;
  /** Public notice URL the recipient opened. */
  noticeUrl: string;
}

export interface EmailResult {
  /** True when Resend accepted the message; false when skipped (no API key). */
  sent: boolean;
}

/**
 * Send the "your notice was viewed" alert to the service owner. Resolves with
 * `{ sent: false }` (never throws) when no API key is configured, so callers on
 * the request path can fire-and-tolerate.
 */
export async function sendFirstAccessEmail(
  email: FirstAccessEmail,
): Promise<EmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { sent: false };

  const viewedUtc = `${email.viewedAt
    .toISOString()
    .replace("T", " ")
    .replace(/\.\d+Z$/, " UTC")}`;

  const text = [
    `Your served notice was viewed for the first time.`,
    ``,
    `Case: ${email.caseRef}`,
    `Viewed (UTC): ${viewedUtc}`,
    `Recipient IP (masked): ${email.maskedIp}`,
    `Notice: ${email.noticeUrl}`,
    ``,
    `This is an automated alert. EPS facilitates service of process and`,
    `generates court-ready proof of on-chain delivery.`,
  ].join("\n");

  const res = await fetch(RESEND_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: process.env.RESEND_FROM ?? DEFAULT_FROM,
      to: email.to,
      subject: `Notice viewed: ${email.caseRef}`,
      text,
    }),
  });

  return { sent: res.ok };
}
